import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import AdmZip from 'adm-zip';
import multer from 'multer';
import { z } from 'zod';
import type { AppContext } from '../types.js';
import { ApiError, notFound, ok } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { getAllSettings, updateSettingsGroup } from '../lib/settings.js';
import { now, transaction } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { settingsGroups, type SettingsGroup } from '../schemas.js';
import { log } from '../logger.js';

const BACKUP_SCHEMA_VERSION = 1;

interface ExportBundle {
  manifest: {
    app: 'ccwall';
    appVersion: string;
    schemaVersion: number;
    createdAt: string;
    kind: 'config' | 'full';
  };
  settings: Record<string, unknown>;
  wallboards: Record<string, unknown>[];
  slides: Record<string, unknown>[];
  wallboardSlides: Record<string, unknown>[];
  media: Record<string, unknown>[];
  users: Record<string, unknown>[];
}

function buildExport(ctx: AppContext, kind: 'config' | 'full'): ExportBundle {
  // Config exports never contain password hashes or PIN hashes.
  const users = ctx.db
    .prepare('SELECT id, username, email, role, display_name, disabled, created_at FROM users')
    .all() as Record<string, unknown>[];
  const wallboards = (
    ctx.db.prepare('SELECT * FROM wallboards').all() as Record<string, unknown>[]
  ).map((w) => ({ ...w, pin_hash: null }));
  return {
    manifest: {
      app: 'ccwall',
      appVersion: ctx.config.version,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      createdAt: now(),
      kind
    },
    settings: getAllSettings(ctx.db) as unknown as Record<string, unknown>,
    wallboards,
    slides: ctx.db.prepare('SELECT * FROM slides').all() as Record<string, unknown>[],
    wallboardSlides: ctx.db.prepare('SELECT * FROM wallboard_slides').all() as Record<string, unknown>[],
    media: ctx.db.prepare('SELECT * FROM media_assets').all() as Record<string, unknown>[],
    users
  };
}

const manifestSchema = z.object({
  app: z.literal('ccwall'),
  appVersion: z.string(),
  schemaVersion: z.number().int().min(1).max(BACKUP_SCHEMA_VERSION),
  createdAt: z.string(),
  kind: z.enum(['config', 'full'])
});

export function backupRoutes(ctx: AppContext): Router {
  const router = Router();
  router.use('/backup', requireRole('admin'));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2048 * 1024 * 1024, files: 1 }
  });

  router.get('/backup/records', (_req, res) => {
    const rows = ctx.db.prepare('SELECT * FROM backup_records ORDER BY ts DESC LIMIT 50').all();
    ok(res, { items: rows });
  });

  // Config-only JSON export (no media binaries, no password/PIN hashes).
  router.get('/backup/export', (req, res) => {
    const bundle = buildExport(ctx, 'config');
    audit(ctx.db, req, { action: 'backup.export', details: { kind: 'config' } });
    res.setHeader('Content-Disposition', `attachment; filename="ccwall-export-${Date.now()}.json"`);
    res.json(bundle);
  });

  // Full backup: export.json + db snapshot + uploads, zipped into backups dir.
  router.post('/backup/full', (req, res) => {
    const id = crypto.randomUUID();
    const fileName = `ccwall-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    const filePath = path.join(ctx.config.backupsDir, fileName);
    try {
      const zip = new AdmZip();
      zip.addFile('export.json', Buffer.from(JSON.stringify(buildExport(ctx, 'full'), null, 2)));
      try {
        const snapshot = path.join(ctx.config.backupsDir, `.db-snapshot-${id}`);
        // node:sqlite has no online-backup API here; a WAL checkpoint + copy is
        // sufficient because we're the only writer.
        ctx.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        fs.copyFileSync(ctx.config.dbPath, snapshot);
        zip.addLocalFile(snapshot, '', 'ccwall.db');
        fs.unlinkSync(snapshot);
      } catch (err) {
        log.warn('db snapshot skipped', { error: String(err) });
      }
      for (const entry of fs.readdirSync(ctx.config.uploadsDir)) {
        const p = path.join(ctx.config.uploadsDir, entry);
        if (fs.statSync(p).isFile()) zip.addLocalFile(p, 'uploads');
      }
      zip.writeZip(filePath);
      const size = fs.statSync(filePath).size;
      ctx.db
        .prepare(
          'INSERT INTO backup_records (id, ts, kind, file_name, size, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(id, now(), 'full', fileName, size, 'ok', req.user!.username);
      audit(ctx.db, req, { action: 'backup.create', resourceId: id, details: { fileName, size } });
      ok(res, { id, fileName, size }, 201);
    } catch (err) {
      ctx.db
        .prepare(
          'INSERT INTO backup_records (id, ts, kind, file_name, size, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(id, now(), 'full', fileName, 0, 'failed', req.user!.username);
      ctx.db
        .prepare('INSERT INTO notifications (ts, level, title, body) VALUES (?, ?, ?, ?)')
        .run(now(), 'error', 'Backup failed', String(err).slice(0, 500));
      throw new ApiError(500, 'backup_failed', 'Backup creation failed');
    }
  });

  router.get('/backup/download/:id', (req, res) => {
    const row = ctx.db.prepare('SELECT * FROM backup_records WHERE id = ?').get(String(req.params.id)) as unknown as
      | { file_name: string; status: string }
      | undefined;
    if (!row || row.status !== 'ok' || !row.file_name) throw notFound('Backup');
    const filePath = path.join(ctx.config.backupsDir, path.basename(row.file_name));
    if (!fs.existsSync(filePath)) throw notFound('Backup file');
    res.download(filePath, row.file_name);
  });

  router.delete('/backup/records/:id', (req, res) => {
    const row = ctx.db.prepare('SELECT * FROM backup_records WHERE id = ?').get(String(req.params.id)) as unknown as
      | { id: string; file_name: string | null }
      | undefined;
    if (!row) throw notFound('Backup');
    if (row.file_name) {
      try {
        fs.unlinkSync(path.join(ctx.config.backupsDir, path.basename(row.file_name)));
      } catch {
        /* already gone */
      }
    }
    ctx.db.prepare('DELETE FROM backup_records WHERE id = ?').run(row.id);
    ok(res, { deleted: true });
  });

  // Validate a backup without applying it.
  router.post('/backup/validate', upload.single('file'), (req, res) => {
    const bundle = parseUpload(req.file?.buffer, req.body?.json);
    ok(res, {
      valid: true,
      manifest: bundle.manifest,
      counts: {
        wallboards: bundle.wallboards.length,
        slides: bundle.slides.length,
        media: bundle.media.length,
        users: bundle.users.length
      }
    });
  });

  /**
   * Destructive restore. Replaces wallboards, slides, playlist assignments,
   * media metadata and settings. Users and passwords are NOT restored from
   * config exports (they contain no password material). Requires confirm=true.
   */
  router.post('/backup/restore', upload.single('file'), (req, res) => {
    if (req.body?.confirm !== 'true' && req.body?.confirm !== true) {
      throw new ApiError(400, 'confirmation_required', 'Restore requires explicit confirmation');
    }
    const bundle = parseUpload(req.file?.buffer, req.body?.json);
    const zip = req.file && isZip(req.file.buffer) ? new AdmZip(req.file.buffer) : null;
    try {
      transaction(ctx.db, () => {
        ctx.db.exec('DELETE FROM wallboard_slides; DELETE FROM slides; DELETE FROM wallboards; DELETE FROM media_assets;');
        const insertWb = ctx.db.prepare(
          `INSERT INTO wallboards (id, name, description, slug, enabled, default_duration, transition,
            transition_duration, background, aspect_ratio, resolution, fullscreen_behavior, autostart,
            loop_slides, refresh_minutes, schedule_json, access, access_token, pin_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const w of bundle.wallboards as Record<string, string | number | null>[]) {
          insertWb.run(
            w.id ?? null, w.name ?? null, w.description ?? '', w.slug ?? null, w.enabled ?? 1, w.default_duration ?? 15,
            w.transition ?? 'fade', w.transition_duration ?? 500, w.background ?? '#0b1020',
            w.aspect_ratio ?? 'auto', w.resolution ?? 'auto', w.fullscreen_behavior ?? 'button',
            w.autostart ?? 1, w.loop_slides ?? 1, w.refresh_minutes ?? 0, w.schedule_json ?? null,
            w.access ?? 'public', w.access_token ?? null, w.pin_hash ?? null,
            w.created_at ?? now(), w.updated_at ?? now()
          );
        }
        const insertSlide = ctx.db.prepare(
          `INSERT INTO slides (id, title, description, type, enabled, duration, background, text_color,
            transition_override, start_at, end_at, days_of_week, tags, config, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const s of bundle.slides as Record<string, string | number | null>[]) {
          insertSlide.run(
            s.id ?? null, s.title ?? null, s.description ?? '', s.type ?? null, s.enabled ?? 1, s.duration ?? null,
            s.background ?? '', s.text_color ?? '', s.transition_override ?? null, s.start_at ?? null,
            s.end_at ?? null, s.days_of_week ?? null, s.tags ?? '', s.config ?? '{}',
            s.created_at ?? now(), s.updated_at ?? now()
          );
        }
        const insertWs = ctx.db.prepare(
          'INSERT INTO wallboard_slides (wallboard_id, slide_id, position, duration_override) VALUES (?, ?, ?, ?)'
        );
        for (const ws of bundle.wallboardSlides as Record<string, string | number | null>[]) {
          insertWs.run(ws.wallboard_id ?? null, ws.slide_id ?? null, ws.position ?? 0, ws.duration_override ?? null);
        }
        const insertMedia = ctx.db.prepare(
          `INSERT INTO media_assets (id, original_name, file_name, mime, kind, size, uploaded_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const m of bundle.media as Record<string, string | number | null>[]) {
          insertMedia.run(
            m.id ?? null, m.original_name ?? null, m.file_name ?? null, m.mime ?? null, m.kind ?? null, m.size ?? 0, m.uploaded_by ?? null,
            m.created_at ?? now()
          );
        }
        for (const group of Object.keys(settingsGroups) as SettingsGroup[]) {
          const stored = (bundle.settings as Record<string, Record<string, unknown>>)[group];
          if (stored) updateSettingsGroup(ctx.db, group, stored);
        }
      });
      // Restore media binaries from a full-backup zip (names sanitized).
      let restoredFiles = 0;
      if (zip) {
        for (const entry of zip.getEntries()) {
          if (!entry.entryName.startsWith('uploads/') || entry.isDirectory) continue;
          const base = path.basename(entry.entryName);
          if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/.test(base)) continue;
          fs.writeFileSync(path.join(ctx.config.uploadsDir, base), entry.getData());
          restoredFiles += 1;
        }
      }
      ctx.db
        .prepare(
          'INSERT INTO backup_records (id, ts, kind, file_name, size, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(crypto.randomUUID(), now(), 'restore', req.file?.originalname?.slice(0, 200) ?? 'inline-json', req.file?.size ?? 0, 'ok', req.user!.username);
      audit(ctx.db, req, {
        action: 'backup.restore',
        details: {
          wallboards: bundle.wallboards.length,
          slides: bundle.slides.length,
          mediaFiles: restoredFiles
        }
      });
      ok(res, { restored: true, restoredFiles });
    } catch (err) {
      ctx.db
        .prepare('INSERT INTO notifications (ts, level, title, body) VALUES (?, ?, ?, ?)')
        .run(now(), 'error', 'Restore failed', String(err).slice(0, 500));
      throw err instanceof ApiError ? err : new ApiError(500, 'restore_failed', 'Restore failed');
    }
  });

  function isZip(buf: Buffer): boolean {
    return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
  }

  function parseUpload(fileBuffer: Buffer | undefined, inlineJson: string | undefined): ExportBundle {
    let raw: string;
    if (fileBuffer) {
      if (isZip(fileBuffer)) {
        const zip = new AdmZip(fileBuffer);
        const entry = zip.getEntry('export.json');
        if (!entry) throw new ApiError(400, 'invalid_backup', 'Zip does not contain export.json');
        raw = entry.getData().toString('utf8');
      } else {
        raw = fileBuffer.toString('utf8');
      }
    } else if (inlineJson) {
      raw = inlineJson;
    } else {
      throw new ApiError(400, 'no_file', 'No backup file provided');
    }
    let parsed: ExportBundle;
    try {
      parsed = JSON.parse(raw) as ExportBundle;
    } catch {
      throw new ApiError(400, 'invalid_backup', 'Backup is not valid JSON');
    }
    const manifest = manifestSchema.safeParse(parsed.manifest);
    if (!manifest.success) {
      throw new ApiError(400, 'invalid_backup', 'Backup manifest is missing or incompatible');
    }
    for (const key of ['wallboards', 'slides', 'wallboardSlides', 'media', 'settings'] as const) {
      if (parsed[key] === undefined) {
        throw new ApiError(400, 'invalid_backup', `Backup is missing "${key}"`);
      }
    }
    return parsed;
  }

  return router;
}
