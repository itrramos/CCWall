import type { NextFunction, Request, Response } from 'express';
import type { AppContext } from '../types.js';
import { getSettingsGroup } from '../lib/settings.js';
import { ApiError } from '../lib/http.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense-in-depth alongside SameSite=Lax cookies: state-changing API
 * requests that carry an Origin header must originate from this host (or a
 * configured allowed origin).
 */
export function csrfProtect(ctx: AppContext) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (!origin) {
      // Non-browser clients (curl, tests) don't send Origin; the session
      // cookie itself is SameSite so browsers always include Origin on
      // cross-site POSTs.
      next();
      return;
    }
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      next(new ApiError(403, 'csrf_rejected', 'Invalid Origin header'));
      return;
    }
    if (originHost === req.headers.host) {
      next();
      return;
    }
    const allowed = getSettingsGroup(ctx.db, 'security').allowedOrigins;
    if (allowed.some((a) => a === origin || a === originHost)) {
      next();
      return;
    }
    next(new ApiError(403, 'csrf_rejected', 'Cross-origin request rejected'));
  };
}
