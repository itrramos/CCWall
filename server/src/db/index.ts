import { DatabaseSync } from 'node:sqlite';
import { log } from '../logger.js';
import { migrations } from './migrations.js';

export type Db = DatabaseSync;

export type Row = Record<string, string | number | null>;

export function openDb(dbPath: string): Db {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`);
  const appliedRows = db.prepare('SELECT id FROM schema_migrations').all() as { id: number }[];
  const applied = new Set(appliedRows.map((r) => r.id));
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        m.id,
        m.name,
        new Date().toISOString()
      );
      db.exec('COMMIT');
      log.info('migration applied', { id: m.id, name: m.name });
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

/** Runs fn inside a transaction; rolls back on throw. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function now(): string {
  return new Date().toISOString();
}
