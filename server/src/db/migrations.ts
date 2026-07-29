/**
 * Ordered SQL migrations. Each entry runs once, inside a transaction, and is
 * recorded in the `schema_migrations` table. Never edit an applied migration —
 * append a new one instead. See docs/MIGRATIONS.md.
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial-schema',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
        display_name TEXT NOT NULL DEFAULT '',
        disabled INTEGER NOT NULL DEFAULT 0,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        remember INTEGER NOT NULL DEFAULT 0,
        ip TEXT,
        user_agent TEXT,
        last_seen_at TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE wallboards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        slug TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1,
        default_duration INTEGER NOT NULL DEFAULT 15,
        transition TEXT NOT NULL DEFAULT 'fade',
        transition_duration INTEGER NOT NULL DEFAULT 500,
        background TEXT NOT NULL DEFAULT '#0b1020',
        aspect_ratio TEXT NOT NULL DEFAULT 'auto',
        resolution TEXT NOT NULL DEFAULT 'auto',
        fullscreen_behavior TEXT NOT NULL DEFAULT 'button',
        autostart INTEGER NOT NULL DEFAULT 1,
        loop_slides INTEGER NOT NULL DEFAULT 1,
        refresh_minutes INTEGER NOT NULL DEFAULT 0,
        schedule_json TEXT,
        access TEXT NOT NULL DEFAULT 'public',
        access_token TEXT,
        pin_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_wallboards_slug ON wallboards(slug);
      CREATE INDEX idx_wallboards_updated ON wallboards(updated_at);

      CREATE TABLE slides (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        duration INTEGER,
        background TEXT NOT NULL DEFAULT '',
        text_color TEXT NOT NULL DEFAULT '',
        transition_override TEXT,
        start_at TEXT,
        end_at TEXT,
        days_of_week TEXT,
        tags TEXT NOT NULL DEFAULT '',
        config TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_slides_type ON slides(type);
      CREATE INDEX idx_slides_updated ON slides(updated_at);
      CREATE INDEX idx_slides_title ON slides(title);

      CREATE TABLE wallboard_slides (
        wallboard_id TEXT NOT NULL REFERENCES wallboards(id) ON DELETE CASCADE,
        slide_id TEXT NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        duration_override INTEGER,
        PRIMARY KEY (wallboard_id, slide_id)
      );
      CREATE INDEX idx_wallboard_slides_pos ON wallboard_slides(wallboard_id, position);

      CREATE TABLE media_assets (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        file_name TEXT NOT NULL UNIQUE,
        mime TEXT NOT NULL,
        kind TEXT NOT NULL,
        size INTEGER NOT NULL,
        uploaded_by TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_media_created ON media_assets(created_at);
      CREATE INDEX idx_media_name ON media_assets(original_name);

      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        user_id TEXT,
        username TEXT,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        details TEXT,
        ip TEXT
      );
      CREATE INDEX idx_audit_ts ON audit_logs(ts);
      CREATE INDEX idx_audit_action ON audit_logs(action);

      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'info',
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        read INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_notifications_ts ON notifications(ts);

      CREATE TABLE backup_records (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        kind TEXT NOT NULL,
        file_name TEXT,
        size INTEGER,
        status TEXT NOT NULL,
        created_by TEXT
      );
    `
  }
];
