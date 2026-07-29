import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { Db } from '../db/index.js';
import { now } from '../db/index.js';
import type { Role } from '../schemas.js';

export const SESSION_COOKIE = 'ccwall_session';

export interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: Role;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(
  db: Db,
  userId: string,
  opts: { remember: boolean; timeoutMinutes: number; rememberDays: number; ip?: string; userAgent?: string }
): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('base64url');
  const ttlMs = opts.remember
    ? opts.rememberDays * 24 * 60 * 60 * 1000
    : opts.timeoutMinutes * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  db.prepare(
    `INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, remember, ip, user_agent, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    hashToken(token),
    userId,
    now(),
    expiresAt.toISOString(),
    opts.remember ? 1 : 0,
    opts.ip ?? null,
    (opts.userAgent ?? '').slice(0, 300),
    now()
  );
  return { token, expiresAt };
}

export interface ResolvedSession {
  sessionId: string;
  remember: boolean;
  user: SessionUser & { disabled: number };
}

export function resolveSession(db: Db, token: string): ResolvedSession | null {
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, s.remember,
              u.id, u.username, u.email, u.display_name, u.role, u.disabled
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(hashToken(token)) as
    | {
        session_id: string;
        expires_at: string;
        remember: number;
        id: string;
        username: string;
        email: string | null;
        display_name: string;
        role: Role;
        disabled: number;
      }
    | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now(), row.session_id);
  return {
    sessionId: row.session_id,
    remember: row.remember === 1,
    user: {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      disabled: row.disabled
    }
  };
}

export function destroySession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function destroyAllSessions(db: Db, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function pruneExpiredSessions(db: Db): void {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
}

export function setSessionCookie(req: Request, res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    expires: expiresAt
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function readSessionToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}
