# Changelog

## 1.2.0 — 2026-07-28

### Added
- **Rich announcement cards** — each card in an Announcement slide can now contain an image, a
  video (uploaded or any YouTube link), or an embedded web page alongside its text.
- Per-card media **position** (above / below / left / right / behind the text), **size**
  (30 / 45 / 65 % or fill) and **fit** (contain / cover), with alt text for images.
- **Auto-fit** — card content scales down to fit its card instead of overflowing, so long text
  and mixed media stay inside the rounded borders on any screen size.

Existing announcement slides are unaffected: cards without media render exactly as before.

## 1.1.0 — 2026-07-27

### Added
- **YouTube support** — any YouTube link (watch, `youtu.be`, Shorts, `/live/<id>`, channel live
  pages) pasted into a Video or Website/Report slide is converted automatically to the
  privacy-friendly `youtube-nocookie` embed player, with autoplay/mute/loop from slide settings.
- **Announcement styling** — cards per row (auto/1–4), font family, alignment, title and body
  size and colour, card background, all settable slide-wide and overridable per card.
- All slide types are available out of the box (embedded HTML no longer needs enabling first;
  it remains admin-only and script-less).
- Slide type can now be changed on existing slides, with a confirmation that type-specific
  options reset.

### Fixed
- Editor crashed with a 500 page when selecting the Website/Report type (invalid-URL parsing in
  the live preview).
- Sign-in flows inside Website/Report slides (Tableau, Grafana, Power BI) were unclickable
  because of iframe sandboxing.
- YouTube "Error 153" caused by the app-wide `Referrer-Policy: same-origin` header stripping the
  referrer the player requires.

### Documentation
- Rewritten README with how-to guides, dashboard-embedding and YouTube sections, troubleshooting.
- Documented that bind-mounted data directories must be owned by UID 1000.

## 1.0.0 — 2026-07-18

Initial release, built from the `Leaderboard.html` static-slideshow starter.

### Added
- Full admin portal (React + TypeScript + Vite): dashboard, slide editor with live preview,
  wallboard editor with drag-and-drop playlists, media library, settings, user management,
  security, storage, backup/restore, system info and audit log pages.
- 9 slide types: text, image, website/report URL, video, embedded HTML (sandboxed, admin-only),
  clock & date, announcement grid, metrics tiles, blank background.
- Live wallboard player: transitions, preloading, keyboard controls, full-screen, wake lock,
  polling-based content refresh, per-slide error recovery, on-air scheduling, PIN/token access.
- Express + SQLite backend (built-in `node:sqlite`): REST API, migrations, sessions, RBAC,
  rate limiting, lockout, audit logging, notifications, search, backups.
- Docker packaging (multi-stage, non-root, healthcheck), docker-compose files with CasaOS
  `x-casaos` metadata, ZimaOS instructions.
- 71 automated tests (60 API/integration including an end-to-end workflow, 11 component tests).

### Preserved from the starter
- The rotating-iframe wallboard concept → URL slide type with per-slide refresh intervals.
- The announcements grid → announcement slide type.
