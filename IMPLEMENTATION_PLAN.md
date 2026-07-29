# CCWall — Implementation Plan

## 1. Starter project assessment (`Leaderboard.zip`)

The starter contains two static HTML files, no framework, no build system:

| File | What it is |
|---|---|
| `starter/Leaderboard/Leaderboard.html` | A CSS radio-button slideshow that rotates 9 hard-coded `<iframe>` slides every 20 s, refreshes all iframes once per loop, and pings a keep-alive endpoint every 5 min. |
| `starter/Leaderboard/announcements.html` | A static 2×2 grid of announcement cards with hard-coded text. |

**Reusable ideas (preserved in the new app):**
- The core product concept: a full-screen rotating wallboard of iframe/URL slides for TVs.
- Periodic iframe refresh per loop → becomes the per-slide *refresh interval* option on URL slides.
- The announcements grid → becomes the **Announcement** slide type.
- Keep-alive pinging → replaced by proper playlist polling + wake-lock in the player.

**Technical debt / security concerns in the starter (all resolved by the rewrite):**
- Hard-coded internal IPs/hostnames and slide list — no management UI, no persistence.
- No authentication, no HTTPS-awareness, no CSP, inline everything.
- CSS radio-hack slideshow is fragile (all iframes loaded permanently, no error recovery, white-flash risk).
- No error handling for iframes blocked by `X-Frame-Options`/CSP.

The starter does not justify keeping static HTML as the architecture, so the recommended stack is used. The original files are preserved under `starter/` for reference.

## 2. Architecture

Single container, single Node process, SQLite file DB.

- **Backend**: Node 22+, TypeScript (strict), Express 5, REST API under `/api`.
  - **Database**: SQLite via the built-in `node:sqlite` module (no native compilation → reliable installs on Windows dev machines and Alpine Docker images). Thin typed data layer + ordered SQL migrations run at startup inside transactions.
  - **Auth**: bcryptjs (cost 12), server-side sessions in DB, HttpOnly + SameSite=Lax cookie, Origin-header CSRF check on state-changing requests, login rate limiting + escalating account lockout, roles (admin/editor/viewer).
  - **Validation**: zod schemas on every write route; centralized error handler; consistent `{ ok, data | error }` JSON envelope.
  - **Uploads**: multer to `DATA_DIR/uploads`, extension + MIME whitelist, random generated file names, size limit from settings.
  - **Backups**: adm-zip (pure JS) — config-only JSON export (no password hashes) and full zip (DB snapshot + media), with versioned manifest and validated restore.
  - **Logging**: small structured JSON logger (level from `LOG_LEVEL`), no third-party telemetry.
- **Frontend**: React 18 + TypeScript + Vite + React Router.
  - Central design-token theme (`tokens.css`) with dark (default) + light themes; no scattered hard-coded colors.
  - Small custom fetch/query hook layer (equivalent of TanStack Query at this app's scale: caching, invalidation, loading/error states) and controlled forms validated with zod — fewer moving parts than RHF for this form count. Documented deviation from the "recommended" list; everything else follows it.
  - Accessible hand-rolled drag-and-drop for slide reordering (pointer + keyboard Up/Down buttons) instead of a library — keeps the dependency surface tiny and keyboard support first-class.
  - Live player at `/display/:slug` rendered by the same SPA without admin chrome.
- **Serving**: Express serves the built SPA (`web/dist`) with cache headers, compression, security headers + CSP; SPA fallback for client routes; port **5599**.

## 3. Data model

`users`, `sessions`, `wallboards`, `slides`, `wallboard_slides` (join, position, duration override), `media_assets`, `app_settings` (key/JSON value), `audit_logs`, `notifications`, `backup_records`. Indexes on slugs, lookups, and audit timestamps. Transactions for multi-step writes (reorder, duplicate, restore, deletes).

## 4. Feature slices (build order)

1. Server scaffold: config, logger, DB + migrations, error envelope, health.
2. Auth: first-run setup, login/logout/logout-all, change password, sessions, lockout, RBAC middleware.
3. CRUD APIs: wallboards (+slide assignment/reorder/duplicate), slides (9 types, config JSON), media, settings, users, audit, notifications, search, backup/restore, display (public/token/PIN, schedule-filtered).
4. Web shell: tokens, layout (sidebar/topbar/search/notifications/account menu), routing, guards.
5. Pages: Dashboard, Slides + editor (live preview, unsaved-changes guard), Wallboards + editor (DnD ordering), Media, Settings (General/Wallboard/Security/Storage/System), Users, Audit, Backup, Setup, Login.
6. Player: transitions, timing, preload, keyboard controls, wake lock, polling for updates, error recovery, connection indicator.
7. Packaging: Dockerfile (multi-stage, non-root), compose files, CasaOS metadata, docs.
8. Tests: vitest + supertest integration suite (auth, RBAC, CRUD, ordering, uploads, settings, display access, scheduling) + frontend unit tests + API-driven end-to-end workflow test.

## 5. Verification

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, manual run on port 5599 with browser smoke test of the full admin + display flow. Docker build validated by CI-standard multi-stage file (no Docker daemon available in the build environment — documented honestly).
