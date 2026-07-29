import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import type { AppContext } from '../types.js';
import { ok } from '../lib/http.js';
import { getSettingsGroup } from '../lib/settings.js';
import { expiresWithinDays } from '../lib/schedule.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listQuery } from '../schemas.js';
import { getLogLevel } from '../logger.js';

function dirSize(dir: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isFile()) total += fs.statSync(p).size;
      else if (entry.isDirectory()) total += dirSize(p);
    }
  } catch {
    /* directory may not exist yet */
  }
  return total;
}

export function miscRoutes(ctx: AppContext): Router {
  const router = Router();

  // ---- dashboard stats ----
  router.get('/stats', requireAuth, (_req, res) => {
    const count = (sql: string): number => (ctx.db.prepare(sql).get() as { n: number }).n;
    const recentSlides = ctx.db
      .prepare('SELECT id, title, type, enabled, updated_at FROM slides ORDER BY updated_at DESC LIMIT 6')
      .all();
    const recentWallboards = ctx.db
      .prepare('SELECT id, name, slug, enabled, updated_at FROM wallboards ORDER BY updated_at DESC LIMIT 6')
      .all();
    const recentActivity = ctx.db
      .prepare(
        'SELECT ts, username, action, resource_type, resource_id, details FROM audit_logs ORDER BY id DESC LIMIT 10'
      )
      .all();
    const upcoming = ctx.db
      .prepare(
        `SELECT id, title, start_at, end_at FROM slides
         WHERE (start_at IS NOT NULL AND start_at > ?) OR (end_at IS NOT NULL AND end_at > ?)
         ORDER BY COALESCE(start_at, end_at) LIMIT 8`
      )
      .all(new Date().toISOString(), new Date().toISOString());
    ok(res, {
      totals: {
        wallboards: count('SELECT COUNT(*) AS n FROM wallboards'),
        enabledWallboards: count('SELECT COUNT(*) AS n FROM wallboards WHERE enabled = 1'),
        slides: count('SELECT COUNT(*) AS n FROM slides'),
        activeSlides: count('SELECT COUNT(*) AS n FROM slides WHERE enabled = 1'),
        disabledSlides: count('SELECT COUNT(*) AS n FROM slides WHERE enabled = 0'),
        media: count('SELECT COUNT(*) AS n FROM media_assets')
      },
      storage: {
        mediaBytes: (
          ctx.db.prepare('SELECT COALESCE(SUM(size), 0) AS b FROM media_assets').get() as { b: number }
        ).b,
        dataDirBytes: dirSize(ctx.config.dataDir)
      },
      recentSlides,
      recentWallboards,
      recentActivity,
      upcoming,
      system: {
        version: ctx.config.version,
        uptimeSeconds: Math.floor((Date.now() - ctx.startedAt) / 1000),
        healthy: true
      }
    });
  });

  // ---- global search ----
  router.get('/search', requireAuth, (req, res) => {
    const q = String(req.query.q ?? '').slice(0, 100);
    if (q.length < 2) {
      ok(res, { slides: [], wallboards: [], media: [], users: [] });
      return;
    }
    const like = `%${q}%`;
    const slides = ctx.db
      .prepare('SELECT id, title, type FROM slides WHERE title LIKE ? OR tags LIKE ? LIMIT 8')
      .all(like, like);
    const wallboards = ctx.db
      .prepare('SELECT id, name, slug FROM wallboards WHERE name LIKE ? OR slug LIKE ? LIMIT 8')
      .all(like, like);
    const media = ctx.db
      .prepare('SELECT id, original_name AS name, kind FROM media_assets WHERE original_name LIKE ? LIMIT 8')
      .all(like);
    const users =
      req.user!.role === 'admin'
        ? ctx.db
            .prepare('SELECT id, username, role FROM users WHERE username LIKE ? OR email LIKE ? LIMIT 8')
            .all(like, like)
        : [];
    ok(res, { slides, wallboards, media, users });
  });

  // ---- notifications ----
  router.get('/notifications', requireAuth, (_req, res) => {
    const stored = ctx.db
      .prepare('SELECT id, ts, level, title, body, read FROM notifications ORDER BY id DESC LIMIT 50')
      .all() as { id: number; ts: string; level: string; title: string; body: string; read: number }[];
    // Derived: slides expiring within 7 days.
    const expiring = (
      ctx.db.prepare('SELECT id, title, end_at FROM slides WHERE end_at IS NOT NULL AND enabled = 1').all() as {
        id: string;
        title: string;
        end_at: string;
      }[]
    ).filter((s) => expiresWithinDays(s.end_at, 7));
    // Derived: storage warning above 90% of a soft 10 GB budget or low disk.
    const mediaBytes = (
      ctx.db.prepare('SELECT COALESCE(SUM(size), 0) AS b FROM media_assets').get() as { b: number }
    ).b;
    const derived: { level: string; title: string; body: string }[] = expiring.map((s) => ({
      level: 'warning',
      title: 'Slide expiring soon',
      body: `"${s.title}" ends ${new Date(s.end_at).toLocaleDateString()}`
    }));
    if (mediaBytes > 10 * 1024 ** 3 * 0.9) {
      derived.push({
        level: 'warning',
        title: 'Storage usage high',
        body: `Media library is using ${(mediaBytes / 1024 ** 3).toFixed(1)} GB`
      });
    }
    ok(res, {
      items: stored.map((n) => ({ ...n, read: n.read === 1 })),
      derived,
      unread: stored.filter((n) => n.read === 0).length + derived.length
    });
  });

  router.post('/notifications/mark-read', requireAuth, (_req, res) => {
    ctx.db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
    ok(res, { marked: true });
  });

  // ---- audit logs (admin) ----
  router.get('/audit', requireRole('admin'), (req, res) => {
    const q = listQuery.parse(req.query);
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q.q) {
      where.push('(username LIKE ? OR action LIKE ? OR resource_type LIKE ?)');
      const like = `%${q.q}%`;
      params.push(like, like, like);
    }
    if (action) {
      where.push('action LIKE ?');
      params.push(`${action}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      ctx.db.prepare(`SELECT COUNT(*) AS n FROM audit_logs ${whereSql}`).get(...params) as { n: number }
    ).n;
    const rows = ctx.db
      .prepare(`SELECT * FROM audit_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize);
    ok(res, { items: rows, total, page: q.page, pageSize: q.pageSize });
  });

  // ---- system info (admin) ----
  router.get('/system', requireRole('admin'), (_req, res) => {
    let dbBytes = 0;
    try {
      dbBytes = fs.statSync(ctx.config.dbPath).size;
    } catch {
      /* in-memory db in tests */
    }
    ok(res, {
      version: ctx.config.version,
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSeconds: Math.floor((Date.now() - ctx.startedAt) / 1000),
      startedAt: new Date(ctx.startedAt).toISOString(),
      dataDir: ctx.config.dataDir,
      dbBytes,
      logLevel: getLogLevel(),
      env: {
        NODE_ENV: ctx.config.nodeEnv,
        PORT: ctx.config.port,
        TZ: process.env.TZ ?? 'system default',
        TRUST_PROXY: String(ctx.config.trustProxy)
      },
      settings: {
        auditRetentionDays: getSettingsGroup(ctx.db, 'system').auditRetentionDays
      }
    });
  });

  return router;
}
