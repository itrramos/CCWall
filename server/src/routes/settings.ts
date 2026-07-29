import { Router } from 'express';
import type { AppContext } from '../types.js';
import { ApiError, ok } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { getAllSettings, getSettingsGroup, updateSettingsGroup } from '../lib/settings.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { settingsGroups, type SettingsGroup } from '../schemas.js';
import { setLogLevel } from '../logger.js';

function isGroup(g: string): g is SettingsGroup {
  return Object.hasOwn(settingsGroups, g);
}

export function settingsRoutes(ctx: AppContext): Router {
  const router = Router();

  // Any authenticated user can read general + wallboard settings (the UI needs
  // them for theming and defaults); security/storage/system are admin-only.
  router.get('/settings', requireAuth, (req, res) => {
    if (req.user!.role === 'admin') {
      ok(res, getAllSettings(ctx.db));
      return;
    }
    ok(res, {
      general: getSettingsGroup(ctx.db, 'general'),
      wallboard: getSettingsGroup(ctx.db, 'wallboard')
    });
  });

  router.put('/settings/:group', requireRole('admin'), (req, res) => {
    const group = String(req.params.group);
    if (!isGroup(group)) throw new ApiError(404, 'not_found', 'Unknown settings group');
    const updated = updateSettingsGroup(ctx.db, group, req.body as Record<string, unknown>);
    if (group === 'system') {
      setLogLevel(getSettingsGroup(ctx.db, 'system').logLevel);
    }
    audit(ctx.db, req, {
      action: 'settings.update',
      resourceType: 'settings',
      resourceId: group,
      details: { keys: Object.keys((req.body as object) ?? {}) }
    });
    ok(res, updated);
  });

  return router;
}
