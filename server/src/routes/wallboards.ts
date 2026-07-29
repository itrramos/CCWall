import crypto from 'node:crypto';
import { Router } from 'express';
import type { AppContext } from '../types.js';
import { ApiError, notFound, ok } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { hashPassword } from '../lib/passwords.js';
import { now, transaction } from '../db/index.js';
import { listQuery, wallboardCreate, wallboardSlidesPut, wallboardUpdate } from '../schemas.js';
import { requireRole } from '../middleware/auth.js';
import { uniqueSlug } from '../lib/slugs.js';
import { slideFromRow, wallboardFromRow, type SlideRow, type WallboardRow } from '../lib/serialize.js';

const SORTABLE = new Set(['name', 'updated_at', 'created_at']);

function getWallboard(ctx: AppContext, id: string): WallboardRow {
  const row = ctx.db.prepare('SELECT * FROM wallboards WHERE id = ?').get(id) as unknown as
    | WallboardRow
    | undefined;
  if (!row) throw notFound('Wallboard');
  return row;
}

function wallboardWithSlides(ctx: AppContext, row: WallboardRow): Record<string, unknown> {
  const slides = ctx.db
    .prepare(
      `SELECT s.*, ws.position, ws.duration_override FROM wallboard_slides ws
       JOIN slides s ON s.id = ws.slide_id WHERE ws.wallboard_id = ? ORDER BY ws.position`
    )
    .all(row.id) as unknown as (SlideRow & { position: number; duration_override: number | null })[];
  return {
    ...wallboardFromRow(row, { includeToken: true }),
    slides: slides.map((s) => ({
      ...slideFromRow(s),
      position: s.position,
      durationOverride: s.duration_override
    }))
  };
}

export function wallboardRoutes(ctx: AppContext): Router {
  const router = Router();
  router.use('/wallboards', requireRole('viewer'));

  router.get('/wallboards', (req, res) => {
    const q = listQuery.parse(req.query);
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q.q) {
      where.push('(name LIKE ? OR description LIKE ? OR slug LIKE ?)');
      const like = `%${q.q}%`;
      params.push(like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sort = q.sort && SORTABLE.has(q.sort) ? q.sort : 'updated_at';
    const order = q.order === 'asc' ? 'ASC' : 'DESC';
    const total = (
      ctx.db.prepare(`SELECT COUNT(*) AS n FROM wallboards ${whereSql}`).get(...params) as { n: number }
    ).n;
    const rows = ctx.db
      .prepare(
        `SELECT w.*, (SELECT COUNT(*) FROM wallboard_slides ws WHERE ws.wallboard_id = w.id) AS slide_count
         FROM wallboards w ${whereSql} ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`
      )
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as unknown as (WallboardRow & {
      slide_count: number;
    })[];
    ok(res, {
      items: rows.map((r) => ({ ...wallboardFromRow(r), slideCount: r.slide_count })),
      total,
      page: q.page,
      pageSize: q.pageSize
    });
  });

  router.get('/wallboards/:id', (req, res) => {
    ok(res, wallboardWithSlides(ctx, getWallboard(ctx, String(req.params.id))));
  });

  router.post('/wallboards', requireRole('editor'), async (req, res) => {
    const body = wallboardCreate.parse(req.body);
    const id = crypto.randomUUID();
    const slug = uniqueSlug(ctx.db, body.slug ?? body.name);
    const ts = now();
    const token = body.access === 'token' ? crypto.randomBytes(24).toString('base64url') : null;
    const pinHash = body.access === 'pin' && body.pin ? await hashPassword(body.pin) : null;
    if (body.access === 'pin' && !body.pin) {
      throw new ApiError(400, 'pin_required', 'A PIN is required when PIN access is selected');
    }
    ctx.db
      .prepare(
        `INSERT INTO wallboards (id, name, description, slug, enabled, default_duration, transition,
          transition_duration, background, aspect_ratio, resolution, fullscreen_behavior, autostart,
          loop_slides, refresh_minutes, schedule_json, access, access_token, pin_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        body.name,
        body.description,
        slug,
        body.enabled ? 1 : 0,
        body.defaultDuration,
        body.transition,
        body.transitionDuration,
        body.background,
        body.aspectRatio,
        body.resolution,
        body.fullscreenBehavior,
        body.autostart ? 1 : 0,
        body.loopSlides ? 1 : 0,
        body.refreshMinutes,
        body.schedule ? JSON.stringify(body.schedule) : null,
        body.access,
        token,
        pinHash,
        ts,
        ts
      );
    audit(ctx.db, req, {
      action: 'wallboard.create',
      resourceType: 'wallboard',
      resourceId: id,
      details: { name: body.name, slug }
    });
    ok(res, wallboardWithSlides(ctx, getWallboard(ctx, id)), 201);
  });

  router.patch('/wallboards/:id', requireRole('editor'), async (req, res) => {
    const existing = getWallboard(ctx, String(req.params.id));
    const body = wallboardUpdate.parse(req.body);
    const slug =
      body.slug !== undefined
        ? uniqueSlug(ctx.db, body.slug, existing.id)
        : existing.slug;
    const access = body.access ?? existing.access;
    let token = existing.access_token;
    if (access === 'token' && !token) token = crypto.randomBytes(24).toString('base64url');
    if (access !== 'token') token = access === existing.access ? token : null;
    let pinHash = existing.pin_hash;
    if (body.pin) pinHash = await hashPassword(body.pin);
    if (access === 'pin' && !pinHash) {
      throw new ApiError(400, 'pin_required', 'A PIN is required when PIN access is selected');
    }
    const ts = now();
    ctx.db
      .prepare(
        `UPDATE wallboards SET name = ?, description = ?, slug = ?, enabled = ?, default_duration = ?,
          transition = ?, transition_duration = ?, background = ?, aspect_ratio = ?, resolution = ?,
          fullscreen_behavior = ?, autostart = ?, loop_slides = ?, refresh_minutes = ?, schedule_json = ?,
          access = ?, access_token = ?, pin_hash = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        body.name ?? existing.name,
        body.description ?? existing.description,
        slug,
        (body.enabled ?? existing.enabled === 1) ? 1 : 0,
        body.defaultDuration ?? existing.default_duration,
        body.transition ?? existing.transition,
        body.transitionDuration ?? existing.transition_duration,
        body.background ?? existing.background,
        body.aspectRatio ?? existing.aspect_ratio,
        body.resolution ?? existing.resolution,
        body.fullscreenBehavior ?? existing.fullscreen_behavior,
        (body.autostart ?? existing.autostart === 1) ? 1 : 0,
        (body.loopSlides ?? existing.loop_slides === 1) ? 1 : 0,
        body.refreshMinutes ?? existing.refresh_minutes,
        body.schedule !== undefined
          ? body.schedule
            ? JSON.stringify(body.schedule)
            : null
          : existing.schedule_json,
        access,
        token,
        pinHash,
        ts,
        existing.id
      );
    audit(ctx.db, req, {
      action: 'wallboard.update',
      resourceType: 'wallboard',
      resourceId: existing.id,
      details: { name: body.name ?? existing.name }
    });
    ok(res, wallboardWithSlides(ctx, getWallboard(ctx, existing.id)));
  });

  router.put('/wallboards/:id/slides', requireRole('editor'), (req, res) => {
    const existing = getWallboard(ctx, String(req.params.id));
    const body = wallboardSlidesPut.parse(req.body);
    const seen = new Set<string>();
    for (const s of body.slides) {
      if (seen.has(s.slideId)) throw new ApiError(400, 'duplicate_slide', 'Duplicate slide in playlist');
      seen.add(s.slideId);
      const found = ctx.db.prepare('SELECT id FROM slides WHERE id = ?').get(s.slideId);
      if (!found) throw new ApiError(400, 'unknown_slide', `Unknown slide: ${s.slideId}`);
    }
    transaction(ctx.db, () => {
      ctx.db.prepare('DELETE FROM wallboard_slides WHERE wallboard_id = ?').run(existing.id);
      const insert = ctx.db.prepare(
        'INSERT INTO wallboard_slides (wallboard_id, slide_id, position, duration_override) VALUES (?, ?, ?, ?)'
      );
      body.slides.forEach((s, i) => {
        insert.run(existing.id, s.slideId, i, s.durationOverride);
      });
      ctx.db.prepare('UPDATE wallboards SET updated_at = ? WHERE id = ?').run(now(), existing.id);
    });
    audit(ctx.db, req, {
      action: 'wallboard.reorder_slides',
      resourceType: 'wallboard',
      resourceId: existing.id,
      details: { count: body.slides.length }
    });
    ok(res, wallboardWithSlides(ctx, getWallboard(ctx, existing.id)));
  });

  router.post('/wallboards/:id/duplicate', requireRole('editor'), (req, res) => {
    const existing = getWallboard(ctx, String(req.params.id));
    const id = crypto.randomUUID();
    const slug = uniqueSlug(ctx.db, existing.slug + '-copy');
    const ts = now();
    transaction(ctx.db, () => {
      ctx.db
        .prepare(
          `INSERT INTO wallboards (id, name, description, slug, enabled, default_duration, transition,
            transition_duration, background, aspect_ratio, resolution, fullscreen_behavior, autostart,
            loop_slides, refresh_minutes, schedule_json, access, access_token, pin_hash, created_at, updated_at)
           SELECT ?, name || ' (copy)', description, ?, enabled, default_duration, transition,
            transition_duration, background, aspect_ratio, resolution, fullscreen_behavior, autostart,
            loop_slides, refresh_minutes, schedule_json, access,
            CASE WHEN access = 'token' THEN ? ELSE NULL END, pin_hash, ?, ?
           FROM wallboards WHERE id = ?`
        )
        .run(id, slug, crypto.randomBytes(24).toString('base64url'), ts, ts, existing.id);
      ctx.db
        .prepare(
          `INSERT INTO wallboard_slides (wallboard_id, slide_id, position, duration_override)
           SELECT ?, slide_id, position, duration_override FROM wallboard_slides WHERE wallboard_id = ?`
        )
        .run(id, existing.id);
    });
    audit(ctx.db, req, {
      action: 'wallboard.duplicate',
      resourceType: 'wallboard',
      resourceId: id,
      details: { from: existing.id, name: existing.name }
    });
    ok(res, wallboardWithSlides(ctx, getWallboard(ctx, id)), 201);
  });

  router.post('/wallboards/:id/regenerate-token', requireRole('editor'), (req, res) => {
    const existing = getWallboard(ctx, String(req.params.id));
    const token = crypto.randomBytes(24).toString('base64url');
    ctx.db
      .prepare("UPDATE wallboards SET access = 'token', access_token = ?, updated_at = ? WHERE id = ?")
      .run(token, now(), existing.id);
    audit(ctx.db, req, {
      action: 'wallboard.regenerate_token',
      resourceType: 'wallboard',
      resourceId: existing.id
    });
    ok(res, { accessToken: token });
  });

  router.delete('/wallboards/:id', requireRole('editor'), (req, res) => {
    const existing = getWallboard(ctx, String(req.params.id));
    transaction(ctx.db, () => {
      ctx.db.prepare('DELETE FROM wallboard_slides WHERE wallboard_id = ?').run(existing.id);
      ctx.db.prepare('DELETE FROM wallboards WHERE id = ?').run(existing.id);
    });
    audit(ctx.db, req, {
      action: 'wallboard.delete',
      resourceType: 'wallboard',
      resourceId: existing.id,
      details: { name: existing.name }
    });
    ok(res, { deleted: true });
  });

  return router;
}
