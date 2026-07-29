import crypto from 'node:crypto';
import { Router } from 'express';
import type { AppContext } from '../types.js';
import { ApiError, notFound, ok } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { getSettingsGroup } from '../lib/settings.js';
import { now, transaction } from '../db/index.js';
import { listQuery, slideConfigSchemas, slideCreate, slideUpdate, type SlideType } from '../schemas.js';
import { requireRole } from '../middleware/auth.js';
import { slideFromRow, type SlideRow } from '../lib/serialize.js';

const SORTABLE = new Set(['title', 'type', 'updated_at', 'created_at']);

function guardEmbeddedHtml(ctx: AppContext, type: string, role: string): void {
  if (type !== 'html') return;
  const security = getSettingsGroup(ctx.db, 'security');
  if (!security.allowEmbeddedHtml) {
    throw new ApiError(403, 'html_disabled', 'Embedded HTML slides are disabled in Security settings');
  }
  if (role !== 'admin') {
    throw new ApiError(403, 'forbidden', 'Only administrators may create embedded HTML slides');
  }
}

export function slideRoutes(ctx: AppContext): Router {
  const router = Router();
  router.use('/slides', requireRole('viewer'));

  router.get('/slides', (req, res) => {
    const q = listQuery.parse(req.query);
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const enabled = typeof req.query.enabled === 'string' ? req.query.enabled : undefined;
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q.q) {
      where.push('(title LIKE ? OR description LIKE ? OR tags LIKE ?)');
      const like = `%${q.q}%`;
      params.push(like, like, like);
    }
    if (type) {
      where.push('type = ?');
      params.push(type);
    }
    if (enabled === 'true' || enabled === 'false') {
      where.push('enabled = ?');
      params.push(enabled === 'true' ? 1 : 0);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sort = q.sort && SORTABLE.has(q.sort) ? q.sort : 'updated_at';
    const order = q.order === 'asc' ? 'ASC' : 'DESC';
    const total = (
      ctx.db.prepare(`SELECT COUNT(*) AS n FROM slides ${whereSql}`).get(...params) as { n: number }
    ).n;
    const rows = ctx.db
      .prepare(`SELECT * FROM slides ${whereSql} ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`)
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as unknown as SlideRow[];
    ok(res, { items: rows.map(slideFromRow), total, page: q.page, pageSize: q.pageSize });
  });

  router.get('/slides/:id', (req, res) => {
    const row = ctx.db.prepare('SELECT * FROM slides WHERE id = ?').get(String(req.params.id)) as unknown as
      | SlideRow
      | undefined;
    if (!row) throw notFound('Slide');
    const usedBy = ctx.db
      .prepare(
        `SELECT w.id, w.name FROM wallboard_slides ws JOIN wallboards w ON w.id = ws.wallboard_id WHERE ws.slide_id = ?`
      )
      .all(String(req.params.id)) as { id: string; name: string }[];
    ok(res, { ...slideFromRow(row), usedBy });
  });

  router.post('/slides', requireRole('editor'), (req, res) => {
    const body = slideCreate.parse(req.body);
    guardEmbeddedHtml(ctx, body.type, req.user!.role);
    const config = slideConfigSchemas[body.type as SlideType].parse(body.config);
    const id = crypto.randomUUID();
    const ts = now();
    ctx.db
      .prepare(
        `INSERT INTO slides (id, title, description, type, enabled, duration, background, text_color,
          transition_override, start_at, end_at, days_of_week, tags, config, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        body.title,
        body.description,
        body.type,
        body.enabled ? 1 : 0,
        body.duration,
        body.background,
        body.textColor,
        body.transitionOverride,
        body.startAt,
        body.endAt,
        body.daysOfWeek ? JSON.stringify(body.daysOfWeek) : null,
        body.tags,
        JSON.stringify(config),
        ts,
        ts
      );
    audit(ctx.db, req, {
      action: 'slide.create',
      resourceType: 'slide',
      resourceId: id,
      details: { title: body.title, type: body.type }
    });
    const row = ctx.db.prepare('SELECT * FROM slides WHERE id = ?').get(id) as unknown as SlideRow;
    ok(res, slideFromRow(row), 201);
  });

  router.patch('/slides/:id', requireRole('editor'), (req, res) => {
    const existing = ctx.db.prepare('SELECT * FROM slides WHERE id = ?').get(String(req.params.id)) as unknown as
      | SlideRow
      | undefined;
    if (!existing) throw notFound('Slide');
    const body = slideUpdate.parse(req.body);
    const type = (body.type ?? existing.type) as SlideType;
    guardEmbeddedHtml(ctx, type, req.user!.role);
    const mergedConfig =
      body.config !== undefined
        ? slideConfigSchemas[type].parse(body.config)
        : type === existing.type
          ? (JSON.parse(existing.config) as Record<string, unknown>)
          : slideConfigSchemas[type].parse({});
    const ts = now();
    ctx.db
      .prepare(
        `UPDATE slides SET title = ?, description = ?, type = ?, enabled = ?, duration = ?, background = ?,
          text_color = ?, transition_override = ?, start_at = ?, end_at = ?, days_of_week = ?, tags = ?,
          config = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        body.title ?? existing.title,
        body.description ?? existing.description,
        type,
        (body.enabled ?? existing.enabled === 1) ? 1 : 0,
        body.duration !== undefined ? body.duration : existing.duration,
        body.background ?? existing.background,
        body.textColor ?? existing.text_color,
        body.transitionOverride !== undefined ? body.transitionOverride : existing.transition_override,
        body.startAt !== undefined ? body.startAt : existing.start_at,
        body.endAt !== undefined ? body.endAt : existing.end_at,
        body.daysOfWeek !== undefined
          ? body.daysOfWeek
            ? JSON.stringify(body.daysOfWeek)
            : null
          : existing.days_of_week,
        body.tags ?? existing.tags,
        JSON.stringify(mergedConfig),
        ts,
        existing.id
      );
    audit(ctx.db, req, {
      action: 'slide.update',
      resourceType: 'slide',
      resourceId: existing.id,
      details: { title: body.title ?? existing.title }
    });
    const row = ctx.db.prepare('SELECT * FROM slides WHERE id = ?').get(existing.id) as unknown as SlideRow;
    ok(res, slideFromRow(row));
  });

  router.post('/slides/:id/duplicate', requireRole('editor'), (req, res) => {
    const existing = ctx.db.prepare('SELECT * FROM slides WHERE id = ?').get(String(req.params.id)) as unknown as
      | SlideRow
      | undefined;
    if (!existing) throw notFound('Slide');
    guardEmbeddedHtml(ctx, existing.type, req.user!.role);
    const id = crypto.randomUUID();
    const ts = now();
    ctx.db
      .prepare(
        `INSERT INTO slides (id, title, description, type, enabled, duration, background, text_color,
          transition_override, start_at, end_at, days_of_week, tags, config, created_at, updated_at)
         SELECT ?, title || ' (copy)', description, type, enabled, duration, background, text_color,
          transition_override, start_at, end_at, days_of_week, tags, config, ?, ?
         FROM slides WHERE id = ?`
      )
      .run(id, ts, ts, existing.id);
    audit(ctx.db, req, {
      action: 'slide.duplicate',
      resourceType: 'slide',
      resourceId: id,
      details: { from: existing.id, title: existing.title }
    });
    const row = ctx.db.prepare('SELECT * FROM slides WHERE id = ?').get(id) as unknown as SlideRow;
    ok(res, slideFromRow(row), 201);
  });

  router.delete('/slides/:id', requireRole('editor'), (req, res) => {
    const existing = ctx.db.prepare('SELECT id, title FROM slides WHERE id = ?').get(String(req.params.id)) as unknown as
      | { id: string; title: string }
      | undefined;
    if (!existing) throw notFound('Slide');
    transaction(ctx.db, () => {
      ctx.db.prepare('DELETE FROM wallboard_slides WHERE slide_id = ?').run(existing.id);
      ctx.db.prepare('DELETE FROM slides WHERE id = ?').run(existing.id);
    });
    audit(ctx.db, req, {
      action: 'slide.delete',
      resourceType: 'slide',
      resourceId: existing.id,
      details: { title: existing.title }
    });
    ok(res, { deleted: true });
  });

  return router;
}
