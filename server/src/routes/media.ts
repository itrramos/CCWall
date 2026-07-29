import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { AppContext } from '../types.js';
import { ApiError, notFound, ok } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { getSettingsGroup } from '../lib/settings.js';
import { now } from '../db/index.js';
import { listQuery } from '../schemas.js';
import { requireRole } from '../middleware/auth.js';
import { mediaFromRow, type MediaRow } from '../lib/serialize.js';

const EXT_MIME: Record<string, { mime: string; kind: 'image' | 'video' }> = {
  png: { mime: 'image/png', kind: 'image' },
  jpg: { mime: 'image/jpeg', kind: 'image' },
  jpeg: { mime: 'image/jpeg', kind: 'image' },
  gif: { mime: 'image/gif', kind: 'image' },
  webp: { mime: 'image/webp', kind: 'image' },
  svg: { mime: 'image/svg+xml', kind: 'image' },
  mp4: { mime: 'video/mp4', kind: 'video' },
  webm: { mime: 'video/webm', kind: 'video' },
  ogg: { mime: 'video/ogg', kind: 'video' }
};

/** Slides whose config references a media asset id. */
export function mediaUsage(ctx: AppContext, mediaId: string): { id: string; title: string }[] {
  return ctx.db
    .prepare(`SELECT id, title FROM slides WHERE config LIKE ?`)
    .all(`%${mediaId}%`) as { id: string; title: string }[];
}

export function mediaRoutes(ctx: AppContext): Router {
  const router = Router();
  router.use('/media', requireRole('viewer'));

  const upload = multer({
    storage: multer.diskStorage({
      destination: ctx.config.uploadsDir,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
        cb(null, `${crypto.randomUUID()}${ext}`);
      }
    }),
    limits: { fileSize: 4096 * 1024 * 1024, files: 1 } // hard cap; real limit enforced below
  });

  router.get('/media', (req, res) => {
    const q = listQuery.parse(req.query);
    const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q.q) {
      where.push('original_name LIKE ?');
      params.push(`%${q.q}%`);
    }
    if (kind === 'image' || kind === 'video') {
      where.push('kind = ?');
      params.push(kind);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sortMap: Record<string, string> = {
      name: 'original_name',
      size: 'size',
      created_at: 'created_at'
    };
    const sort = sortMap[q.sort ?? ''] ?? 'created_at';
    const order = q.order === 'asc' ? 'ASC' : 'DESC';
    const total = (
      ctx.db.prepare(`SELECT COUNT(*) AS n FROM media_assets ${whereSql}`).get(...params) as { n: number }
    ).n;
    const rows = ctx.db
      .prepare(`SELECT * FROM media_assets ${whereSql} ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`)
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as unknown as MediaRow[];
    const totalBytes = (
      ctx.db.prepare('SELECT COALESCE(SUM(size), 0) AS b FROM media_assets').get() as { b: number }
    ).b;
    ok(res, {
      items: rows.map(mediaFromRow),
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalBytes
    });
  });

  router.get('/media/:id/usage', (req, res) => {
    const row = ctx.db.prepare('SELECT id FROM media_assets WHERE id = ?').get(String(req.params.id));
    if (!row) throw notFound('Media asset');
    ok(res, { usedBy: mediaUsage(ctx, String(req.params.id)) });
  });

  router.post('/media', requireRole('editor'), upload.single('file'), (req, res) => {
    const file = req.file;
    if (!file) throw new ApiError(400, 'no_file', 'No file uploaded');
    const cleanup = (): void => {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* already gone */
      }
    };
    const storage = getSettingsGroup(ctx.db, 'storage');
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    const meta = EXT_MIME[ext];
    if (!meta || !storage.allowedMediaTypes.includes(ext as (typeof storage.allowedMediaTypes)[number])) {
      cleanup();
      throw new ApiError(400, 'invalid_type', `File type .${ext || '?'} is not allowed`);
    }
    if (file.size > storage.maxUploadSizeMb * 1024 * 1024) {
      cleanup();
      throw new ApiError(413, 'file_too_large', `File exceeds the ${storage.maxUploadSizeMb} MB limit`);
    }
    const id = crypto.randomUUID();
    ctx.db
      .prepare(
        `INSERT INTO media_assets (id, original_name, file_name, mime, kind, size, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        path.basename(file.originalname).slice(0, 200),
        path.basename(file.path),
        meta.mime,
        meta.kind,
        file.size,
        req.user!.id,
        now()
      );
    audit(ctx.db, req, {
      action: 'media.upload',
      resourceType: 'media',
      resourceId: id,
      details: { name: file.originalname.slice(0, 200), size: file.size }
    });
    const rowOut = ctx.db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as unknown as MediaRow;
    ok(res, mediaFromRow(rowOut), 201);
  });

  router.delete('/media/:id', requireRole('editor'), (req, res) => {
    const row = ctx.db.prepare('SELECT * FROM media_assets WHERE id = ?').get(String(req.params.id)) as unknown as
      | MediaRow
      | undefined;
    if (!row) throw notFound('Media asset');
    const usage = mediaUsage(ctx, row.id);
    if (usage.length > 0 && req.query.force !== 'true') {
      throw new ApiError(409, 'in_use', 'Media asset is used by one or more slides', { usedBy: usage });
    }
    ctx.db.prepare('DELETE FROM media_assets WHERE id = ?').run(row.id);
    const filePath = path.join(ctx.config.uploadsDir, path.basename(row.file_name));
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* file already missing — DB row removed anyway */
    }
    audit(ctx.db, req, {
      action: 'media.delete',
      resourceType: 'media',
      resourceId: row.id,
      details: { name: row.original_name }
    });
    ok(res, { deleted: true });
  });

  // Remove assets not referenced by any slide (Settings > Storage cleanup).
  router.post('/media/cleanup-unused', requireRole('admin'), (req, res) => {
    const rows = ctx.db.prepare('SELECT * FROM media_assets').all() as unknown as MediaRow[];
    let removed = 0;
    for (const row of rows) {
      if (mediaUsage(ctx, row.id).length > 0) continue;
      const settings = getSettingsGroup(ctx.db, 'general');
      if (row.id === settings.logoMediaId || row.id === settings.faviconMediaId) continue;
      ctx.db.prepare('DELETE FROM media_assets WHERE id = ?').run(row.id);
      try {
        fs.unlinkSync(path.join(ctx.config.uploadsDir, path.basename(row.file_name)));
      } catch {
        /* ignore */
      }
      removed += 1;
    }
    audit(ctx.db, req, { action: 'media.cleanup_unused', details: { removed } });
    ok(res, { removed });
  });

  return router;
}
