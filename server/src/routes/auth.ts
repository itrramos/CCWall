import crypto from 'node:crypto';
import { Router } from 'express';
import type { AppContext } from '../types.js';
import { ApiError, ok } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { getSettingsGroup } from '../lib/settings.js';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../lib/passwords.js';
import {
  clearSessionCookie,
  createSession,
  destroyAllSessions,
  destroySession,
  pruneExpiredSessions,
  setSessionCookie
} from '../lib/sessions.js';
import { now } from '../db/index.js';
import { rateLimit } from '../lib/ratelimit.js';
import { changePasswordSchema, loginSchema, setupSchema } from '../schemas.js';
import { requireAuth } from '../middleware/auth.js';

interface DbUser {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  role: 'admin' | 'editor' | 'viewer';
  display_name: string;
  disabled: number;
  failed_attempts: number;
  locked_until: string | null;
}

export function userCount(ctx: AppContext): number {
  const row = ctx.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  return row.n;
}

export function authRoutes(ctx: AppContext): Router {
  const router = Router();
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

  router.get('/auth/status', (req, res) => {
    ok(res, {
      needsSetup: userCount(ctx) === 0,
      user: req.user ?? null
    });
  });

  // First-run administrator setup — only available while no users exist.
  router.post('/setup', loginLimiter, async (req, res) => {
    if (userCount(ctx) > 0) {
      throw new ApiError(409, 'already_setup', 'Setup has already been completed');
    }
    const body = setupSchema.parse(req.body);
    const policy = getSettingsGroup(ctx.db, 'security');
    const problems = checkPasswordPolicy(body.password, policy);
    if (problems.length > 0) {
      throw new ApiError(400, 'weak_password', problems.join('. '), problems);
    }
    const id = crypto.randomUUID();
    const ts = now();
    ctx.db
      .prepare(
        `INSERT INTO users (id, username, email, password_hash, role, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', ?, ?, ?)`
      )
      .run(id, body.username, body.email ?? null, await hashPassword(body.password), body.displayName, ts, ts);
    audit(ctx.db, req, {
      action: 'setup.complete',
      resourceType: 'user',
      resourceId: id,
      userId: id,
      username: body.username
    });
    const session = createSession(ctx.db, id, {
      remember: false,
      timeoutMinutes: policy.sessionTimeoutMinutes,
      rememberDays: policy.rememberMeDays,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    setSessionCookie(req, res, session.token, session.expiresAt);
    ok(res, { id, username: body.username, role: 'admin' }, 201);
  });

  router.post('/auth/login', loginLimiter, async (req, res) => {
    const body = loginSchema.parse(req.body);
    const security = getSettingsGroup(ctx.db, 'security');
    pruneExpiredSessions(ctx.db);
    const maybeUser = ctx.db
      .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
      .get(body.usernameOrEmail, body.usernameOrEmail) as unknown as DbUser | undefined;

    const fail = (reason: string, user?: DbUser): never => {
      audit(ctx.db, req, {
        action: 'auth.login_failed',
        resourceType: 'user',
        resourceId: user?.id,
        userId: null,
        username: body.usernameOrEmail.slice(0, 80),
        details: { reason }
      });
      throw new ApiError(401, 'invalid_credentials', 'Invalid username or password');
    };

    if (!maybeUser) {
      // Constant-ish time: still run a hash comparison.
      await verifyPassword(body.password, '$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZUbExz4S0d9c0jT0P3d0eO9eGm9uS6');
      fail('unknown_user');
    }
    const user = maybeUser as DbUser;
    if (user.disabled === 1) fail('disabled', user);
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      audit(ctx.db, req, {
        action: 'auth.login_locked',
        resourceType: 'user',
        resourceId: user.id,
        userId: null,
        username: user.username
      });
      throw new ApiError(423, 'account_locked', 'Account temporarily locked. Try again later.');
    }
    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      const attempts = user.failed_attempts + 1;
      let lockedUntil: string | null = null;
      if (attempts >= security.maxLoginAttempts) {
        // Escalating lockout: doubles each time the threshold is exceeded again.
        const factor = Math.min(2 ** (attempts - security.maxLoginAttempts), 16);
        lockedUntil = new Date(Date.now() + security.lockoutMinutes * factor * 60 * 1000).toISOString();
      }
      ctx.db
        .prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')
        .run(attempts, lockedUntil, user.id);
      fail('bad_password', user);
    }
    ctx.db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
    const session = createSession(ctx.db, user.id, {
      remember: body.remember,
      timeoutMinutes: security.sessionTimeoutMinutes,
      rememberDays: security.rememberMeDays,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    setSessionCookie(req, res, session.token, session.expiresAt);
    audit(ctx.db, req, {
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      userId: user.id,
      username: user.username
    });
    ok(res, {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      role: user.role
    });
  });

  router.post('/auth/logout', (req, res) => {
    if (req.sessionToken) destroySession(ctx.db, req.sessionToken);
    if (req.user) audit(ctx.db, req, { action: 'auth.logout', resourceType: 'user', resourceId: req.user.id });
    clearSessionCookie(res);
    ok(res, { loggedOut: true });
  });

  router.post('/auth/logout-all', requireAuth, (req, res) => {
    destroyAllSessions(ctx.db, req.user!.id);
    audit(ctx.db, req, { action: 'auth.logout_all', resourceType: 'user', resourceId: req.user!.id });
    clearSessionCookie(res);
    ok(res, { loggedOut: true });
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    const sessions = ctx.db
      .prepare(
        'SELECT id, created_at, last_seen_at, ip, user_agent, remember FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC'
      )
      .all(req.user!.id) as Record<string, unknown>[];
    ok(res, { user: req.user, sessions });
  });

  router.post('/auth/change-password', requireAuth, async (req, res) => {
    const body = changePasswordSchema.parse(req.body);
    const security = getSettingsGroup(ctx.db, 'security');
    const user = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as unknown as DbUser;
    if (!(await verifyPassword(body.currentPassword, user.password_hash))) {
      throw new ApiError(400, 'invalid_password', 'Current password is incorrect');
    }
    const problems = checkPasswordPolicy(body.newPassword, security);
    if (problems.length > 0) {
      throw new ApiError(400, 'weak_password', problems.join('. '), problems);
    }
    ctx.db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(await hashPassword(body.newPassword), now(), user.id);
    // Keep current session, drop all others.
    const current = req.sessionToken!;
    destroyAllSessions(ctx.db, user.id);
    const session = createSession(ctx.db, user.id, {
      remember: false,
      timeoutMinutes: security.sessionTimeoutMinutes,
      rememberDays: security.rememberMeDays,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    void current;
    setSessionCookie(req, res, session.token, session.expiresAt);
    audit(ctx.db, req, { action: 'auth.change_password', resourceType: 'user', resourceId: user.id });
    ok(res, { changed: true });
  });

  return router;
}
