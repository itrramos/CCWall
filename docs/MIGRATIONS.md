# Database migrations

CCWall uses SQLite through Node's built-in `node:sqlite` module. The schema is managed by a
small ordered-migration runner in [`server/src/db/index.ts`](../server/src/db/index.ts) with
migrations defined in [`server/src/db/migrations.ts`](../server/src/db/migrations.ts).

## How it works

- On startup the server ensures a `schema_migrations (id, name, applied_at)` table exists.
- Each entry in the `migrations` array has a numeric `id`, a `name` and a `sql` block.
- Unapplied migrations run in ascending order, each inside a transaction; the id is recorded
  on success and everything rolls back on failure (the app refuses to start).
- WAL journal mode, foreign keys and a 5 s busy timeout are enabled on every connection.

## Rules for adding a migration

1. **Never edit an applied migration** — append a new object with the next `id`.
2. Keep migrations idempotent-by-construction (plain `CREATE`/`ALTER`; the runner guarantees
   single execution, but backups may be restored across versions).
3. Additive changes (new tables/columns with defaults) are preferred; destructive changes need
   a matching bump of `BACKUP_SCHEMA_VERSION` in `server/src/routes/backup.ts` so old backups
   are rejected or handled explicitly.
4. Add indexes for anything that appears in `WHERE`/`ORDER BY` of list endpoints.

## Current schema (migration 1)

`users`, `sessions`, `wallboards`, `slides`, `wallboard_slides` (join with `position` and
`duration_override`), `media_assets`, `app_settings` (key → JSON group), `audit_logs`,
`notifications`, `backup_records` — with indexes on slugs, titles, timestamps and the
playlist ordering column. Only defaults are seeded (settings fall back to schema defaults at
read time; nothing else is seeded).

## Backups vs. migrations

Full backups embed a `manifest.schemaVersion`. Restores are refused when the manifest version
is newer than the running app. After restoring an older backup into a newer app, startup
migrations bring the schema forward automatically (the restore only replaces content rows).
