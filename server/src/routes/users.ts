import crypto from 'node:crypto';
import { Router } from 'express';
import type { AppContext } from '../types.js';
import { ApiError, notFound, ok } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { getSettingsGroup } from '../lib/settings.js';
import { checkPasswordPolicy, hashPassword } from '../lib/passwords.js';
import { destroyAllSessions } from '../lib/sessions.js';
import { now } from '../db/index.js';
import { userCreate, userUpdate } from '../schemas.js';
import { requireRole } from '../middleware/auth.js';
import { userFromRow, type UserRow } from '../lib/serialize.js';

export function userRoutes(ctx: AppContext): Router {
  const router = Router();
  router.use('/users', requireRole('admin'));

  router.get('/users', (_req, res) => {
    const rows = ctx.db
      .prepare(
        'SELECT id, username, email, role, display_name, disabled, created_at, updated_at FROM users ORDER BY username'
      )
      .all() as unknown as UserRow[];
    ok(res, { items: rows.map(userFromRow), total: rows.length });
  });

  router.post('/users', async (req, res) => {
    const body = userCreate.parse(req.body);
    const security = getSettingsGroup(ctx.db, 'security');
    const problems = checkPasswordPolicy(body.password, security);
    if (problems.length > 0) throw new ApiError(400, 'weak_password', problems.join('. '), problems);
    const exists = ctx.db
      .prepare('SELECT id FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)')
      .get(body.username, body.email) as { id: string } | undefined;
    if (exists) throw new ApiError(409, 'conflict', 'Username or email already in use');
    const id = crypto.randomUUID();
    const ts = now();
    ctx.db
      .prepare(
        `INSERT INTO users (id, username, email, password_hash, role, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, body.username, body.email, await hashPassword(body.password), body.role, body.displayName, ts, ts);
    audit(ctx.db, req, {
      action: 'user.create',
      resourceType: 'user',
      resourceId: id,
      details: { username: body.username, role: body.role }
    });
    ok(res, { id }, 201);
  });

  router.patch('/users/:id', async (req, res) => {
    const body = userUpdate.parse(req.body);
    const user = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(String(req.params.id)) as unknown as
      | (UserRow & { password_hash: string })
      | undefined;
    if (!user) throw notFound('User');
    const isSelf = req.user!.id === user.id;
    if (isSelf && (body.role !== undefined || body.disabled === true)) {
      throw new ApiError(400, 'self_lockout', 'You cannot change your own role or disable yourself');
    }
    if (user.role === 'admin' && (body.role !== undefined && body.role !== 'admin')) {
      const admins = ctx.db
        .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0")
        .get() as { n: number };
      if (admins.n <= 1) throw new ApiError(400, 'last_admin', 'Cannot demote the last administrator');
    }
    const changes: Record<string, unknown> = {};
    const ts = now();
    if (body.email !== undefined) {
      ctx.db.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?').run(body.email, ts, user.id);
      changes.email = true;
    }
    if (body.displayName !== undefined) {
      ctx.db
        .prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
        .run(body.displayName, ts, user.id);
      changes.displayName = true;
    }
    if (body.role !== undefined) {
      ctx.db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(body.role, ts, user.id);
      changes.role = body.role;
    }
    if (body.disabled !== undefined) {
      ctx.db
        .prepare('UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?')
        .run(body.disabled ? 1 : 0, ts, user.id);
      if (body.disabled) destroyAllSessions(ctx.db, user.id);
      changes.disabled = body.disabled;
    }
    if (body.password !== undefined) {
      const security = getSettingsGroup(ctx.db, 'security');
      const problems = checkPasswordPolicy(body.password, security);
      if (problems.length > 0) throw new ApiError(400, 'weak_password', problems.join('. '), problems);
      ctx.db
        .prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
        .run(await hashPassword(body.password), ts, user.id);
      destroyAllSessions(ctx.db, user.id);
      changes.password = true;
    }
    audit(ctx.db, req, { action: 'user.update', resourceType: 'user', resourceId: user.id, details: changes });
    ok(res, { updated: true });
  });

  router.delete('/users/:id', (req, res) => {
    const user = ctx.db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(String(req.params.id)) as unknown as
      | { id: string; username: string; role: string }
      | undefined;
    if (!user) throw notFound('User');
    if (user.id === req.user!.id) throw new ApiError(400, 'self_lockout', 'You cannot delete your own account');
    if (user.role === 'admin') {
      const admins = ctx.db
        .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0")
        .get() as { n: number };
      if (admins.n <= 1) throw new ApiError(400, 'last_admin', 'Cannot delete the last administrator');
    }
    ctx.db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    audit(ctx.db, req, {
      action: 'user.delete',
      resourceType: 'user',
      resourceId: user.id,
      details: { username: user.username }
    });
    ok(res, { deleted: true });
  });

  return router;
}
