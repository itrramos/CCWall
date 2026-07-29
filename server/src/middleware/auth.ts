import type { NextFunction, Request, Response } from 'express';
import type { AppContext } from '../types.js';
import { readSessionToken, resolveSession } from '../lib/sessions.js';
import { ApiError } from '../lib/http.js';
import type { Role } from '../schemas.js';

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

/** Attaches req.user when a valid session cookie is present. */
export function attachUser(ctx: AppContext) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = readSessionToken(req);
    if (token) {
      const session = resolveSession(ctx.db, token);
      if (session && !session.user.disabled) {
        req.user = {
          id: session.user.id,
          username: session.user.username,
          email: session.user.email,
          displayName: session.user.displayName,
          role: session.user.role
        };
        req.sessionToken = token;
      }
    }
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new ApiError(401, 'unauthorized', 'Authentication required'));
    return;
  }
  next();
}

/** Requires at least the given role (viewer < editor < admin). */
export function requireRole(minRole: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError(401, 'unauthorized', 'Authentication required'));
      return;
    }
    if (ROLE_RANK[req.user.role] < ROLE_RANK[minRole]) {
      next(new ApiError(403, 'forbidden', 'Insufficient permissions'));
      return;
    }
    next();
  };
}
