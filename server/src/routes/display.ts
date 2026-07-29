import { Router } from 'express';
import type { AppContext } from '../types.js';
import { ApiError, notFound, ok } from '../lib/http.js';
import { getSettingsGroup } from '../lib/settings.js';
import { verifyPassword } from '../lib/passwords.js';
import { isSlideActive, isWallboardOnAir, type WallboardSchedule } from '../lib/schedule.js';
import { rateLimit } from '../lib/ratelimit.js';
import { slideFromRow, wallboardFromRow, type SlideRow, type WallboardRow } from '../lib/serialize.js';

/**
 * Public display API — read-only playlist for the wallboard player.
 * Access model per wallboard: public | token (query/header token) | pin.
 */
export function displayRoutes(ctx: AppContext): Router {
  const router = Router();
  const pinLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 30 });

  router.get('/display/:slug', pinLimiter, async (req, res) => {
    const row = ctx.db.prepare('SELECT * FROM wallboards WHERE slug = ?').get(String(req.params.slug)) as unknown as
      | WallboardRow
      | undefined;
    if (!row || row.enabled !== 1) throw notFound('Wallboard');

    const security = getSettingsGroup(ctx.db, 'security');
    const isAuthed = req.user != null;

    if (!isAuthed) {
      if (!security.publicDisplayAccess) {
        throw new ApiError(403, 'display_disabled', 'Public display access is disabled');
      }
      const effectiveAccess =
        security.requireWallboardTokens && row.access === 'public' ? 'token' : row.access;
      if (effectiveAccess === 'token') {
        const token = (req.query.token as string | undefined) ?? req.headers['x-display-token'];
        if (!row.access_token || token !== row.access_token) {
          throw new ApiError(401, 'token_required', 'A valid display token is required');
        }
      } else if (effectiveAccess === 'pin') {
        const pin = req.query.pin as string | undefined;
        if (!row.pin_hash || !pin || !(await verifyPassword(pin, row.pin_hash))) {
          throw new ApiError(401, 'pin_required', 'A valid PIN is required');
        }
      }
    }

    const schedule = row.schedule_json ? (JSON.parse(row.schedule_json) as WallboardSchedule) : null;
    const onAir = isWallboardOnAir(schedule);

    const slides = ctx.db
      .prepare(
        `SELECT s.*, ws.position, ws.duration_override FROM wallboard_slides ws
         JOIN slides s ON s.id = ws.slide_id WHERE ws.wallboard_id = ? ORDER BY ws.position`
      )
      .all(row.id) as unknown as (SlideRow & { position: number; duration_override: number | null })[];

    const active = slides.filter((s) =>
      isSlideActive({
        enabled: s.enabled === 1,
        startAt: s.start_at,
        endAt: s.end_at,
        daysOfWeek: s.days_of_week ? (JSON.parse(s.days_of_week) as number[]) : null
      })
    );

    const wbSettings = getSettingsGroup(ctx.db, 'wallboard');
    const allowHtml = security.allowEmbeddedHtml;

    // Version lets the player poll cheaply and only re-render on change.
    const version = [
      row.updated_at,
      ...slides.map((s) => s.updated_at),
      String(active.length),
      String(onAir)
    ].join('|');

    ok(res, {
      wallboard: wallboardFromRow(row),
      onAir,
      settings: wbSettings,
      version,
      slides: active
        .filter((s) => s.type !== 'html' || allowHtml)
        .map((s) => ({
          ...slideFromRow(s),
          durationOverride: s.duration_override,
          position: s.position
        }))
    });
  });

  return router;
}
