import type { Request } from 'express';
import type { Db } from '../db/index.js';
import { now } from '../db/index.js';

export interface AuditEntry {
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  userId?: string | null;
  username?: string | null;
}

/**
 * Records an audit event. Details are JSON but must never contain passwords,
 * tokens, or sensitive headers — callers pass explicit, curated fields only.
 */
export function audit(db: Db, req: Request | null, entry: AuditEntry): void {
  const user = req?.user ?? null;
  db.prepare(
    `INSERT INTO audit_logs (ts, user_id, username, action, resource_type, resource_id, details, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    now(),
    entry.userId !== undefined ? entry.userId : (user?.id ?? null),
    entry.username !== undefined ? entry.username : (user?.username ?? null),
    entry.action,
    entry.resourceType ?? null,
    entry.resourceId ?? null,
    entry.details ? JSON.stringify(entry.details) : null,
    req?.ip ?? null
  );
}

export function pruneAuditLogs(db: Db, retentionDays: number): void {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM audit_logs WHERE ts < ?').run(cutoff);
}
