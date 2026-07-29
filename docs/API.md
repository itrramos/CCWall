# CCWall REST API

Base URL: `http://SERVER:5599/api`

## Conventions

- **Envelope**: every JSON response is `{ "ok": true, "data": … }` or
  `{ "ok": false, "error": { "code", "message", "details?" } }`.
- **Auth**: session cookie (`ccwall_session`, HttpOnly). Obtain via `POST /auth/login`.
  Roles: `admin` > `editor` > `viewer`. Marked per endpoint below.
- **CSRF**: state-changing requests from browsers must originate from the app's own origin
  (Origin-header check). Non-browser clients (no Origin header) are unaffected.
- **Pagination**: list endpoints accept `page` (1-based), `pageSize` (≤ 200), `q` (search),
  `sort`, `order=asc|desc` and return `{ items, total, page, pageSize }`.
- **Validation**: all writes are zod-validated; failures return `400 validation_error` with a
  `details` array of `{ path, message }`.
- **Rate limits**: `429 rate_limited` on auth (30/15 min/IP), display PIN attempts
  (30/5 min/IP) and a global API budget (600/min/IP).

## Endpoints

### Health & public
| Method & path | Auth | Description |
|---|---|---|
| `GET /health` | — | Liveness: `{ status: "ok", version }` |
| `GET /ready` | — | Readiness (checks DB) |
| `GET /public-config` | — | App name, subtitle, default theme, `needsSetup` |

### Setup & authentication
| Method & path | Auth | Description |
|---|---|---|
| `POST /setup` | — (first run only) | Create the first admin: `{ username, password, email?, displayName? }`. 409 once users exist |
| `GET /auth/status` | — | `{ needsSetup, user \| null }` |
| `POST /auth/login` | — | `{ usernameOrEmail, password, remember? }`. 401 invalid, 423 locked |
| `POST /auth/logout` | cookie | End current session |
| `POST /auth/logout-all` | any role | End all of the caller's sessions |
| `GET /auth/me` | any role | Current user + active sessions |
| `POST /auth/change-password` | any role | `{ currentPassword, newPassword }`; other sessions are revoked |

### Slides (`viewer` read, `editor` write)
| Method & path | Description |
|---|---|
| `GET /slides` | List; filters `type`, `enabled=true\|false`, `q`; sort `title\|type\|updated_at\|created_at` |
| `POST /slides` | Create. Body: common fields + `type` + type-specific `config` (see below) |
| `GET /slides/:id` | Single slide + `usedBy` wallboards |
| `PATCH /slides/:id` | Partial update |
| `POST /slides/:id/duplicate` | Copy as "*title* (copy)" |
| `DELETE /slides/:id` | Delete (also removed from playlists, transactional) |

Common slide fields: `title`, `description`, `enabled`, `duration` (s, null = wallboard
default), `background`, `textColor`, `transitionOverride`, `startAt`, `endAt`,
`daysOfWeek` (0=Sun…6=Sat, null = all), `tags`, `config`.

`config` by `type`:
- `text`: `heading, body, align, fontSize(sm…xxl), fontWeight, callout, footer`
- `image`: `mediaId, mediaUrl, alt, fit(contain|cover|fill|original), position, caption`
- `url`: `url (http/https only), refreshSeconds, fit(fit|scale-75|scale-50), timeoutSeconds, errorMessage, fallbackText, authNotes`
- `video`: `mediaId, mediaUrl, externalUrl, autoplay, muted, loop, fit, posterId, posterUrl`
- `html`: `html` — requires `allowEmbeddedHtml` security setting **and** admin role
- `clock`: `timeZone, hour12, dateFormat(full|long|medium|short|none), showSeconds, fontSize`
- `announcement`: slide-level `columns(auto|1|2|3|4), fontFamily(default|serif|mono), align, titleSize(sm|md|lg|xl), titleColor, bodySize, bodyColor, cardBackground` plus `items` (≤ 12), each:
  `{ title, body,`
  *style overrides (empty = inherit):* `align?, titleSize?, titleColor?, bodySize?, bodyColor?, cardBackground?,`
  *media:* `mediaType(none|image|video|url), mediaId, mediaUrl, externalUrl (http/https), mediaAlt, mediaFit(contain|cover), mediaPosition(top|bottom|left|right|background), mediaSize(sm|md|lg|full) }`.
  YouTube links in `externalUrl` are rendered with the embed player. `mediaSize: full` (or a card with no text) makes the media fill the space the text leaves.
- `metrics`: `heading, items: [{ label, value, delta, tone }]` (≤ 12)
- `blank`: `{}`

### Wallboards (`viewer` read, `editor` write)
| Method & path | Description |
|---|---|
| `GET /wallboards` | List with `slideCount` |
| `POST /wallboards` | Create: `name, description?, slug?` (generated if omitted), playback fields, `access(public|token|pin), pin?`, `schedule?` |
| `GET /wallboards/:id` | Wallboard + ordered slides (includes `accessToken` for editors) |
| `PATCH /wallboards/:id` | Partial update |
| `PUT /wallboards/:id/slides` | Replace playlist: `{ slides: [{ slideId, durationOverride? }] }` — order = playback order |
| `POST /wallboards/:id/duplicate` | Copy including playlist (new slug + token) |
| `POST /wallboards/:id/regenerate-token` | New access token (old links stop working) |
| `DELETE /wallboards/:id` | Delete (slides survive) |

### Public display
| Method & path | Auth | Description |
|---|---|---|
| `GET /display/:slug` | see below | Playlist for the player: wallboard config, `onAir`, schedule-filtered active `slides`, player `settings`, change-detection `version` |

Access: logged-in users always allowed. Anonymous callers require the global
`publicDisplayAccess` setting, plus `?token=` for token boards and `?pin=` for PIN boards.
HTML slides are omitted when embedded HTML is disabled.

### Media (`viewer` read, `editor` write)
| Method & path | Description |
|---|---|
| `GET /media` | List; filters `kind=image\|video`, `q`; sort `name\|size\|created_at`; includes `totalBytes` |
| `POST /media` | `multipart/form-data`, field `file`. Validates extension/MIME allowlist + size limit. 400 `invalid_type`, 413 `file_too_large` |
| `GET /media/:id/usage` | Slides referencing the asset |
| `DELETE /media/:id` | 409 `in_use` with `usedBy` unless `?force=true` |
| `POST /media/cleanup-unused` | Admin: delete assets referenced by nothing |

Files are served publicly at `/media/<generatedFileName>` (needed by displays).

### Settings
| Method & path | Auth | Description |
|---|---|---|
| `GET /settings` | any role | Admin: all groups; others: `general` + `wallboard` only |
| `PUT /settings/:group` | admin | Partial update; groups: `general`, `wallboard`, `security`, `storage`, `system` |

### Users (admin)
`GET /users` · `POST /users` · `PATCH /users/:id` (email, displayName, role, disabled,
password) · `DELETE /users/:id`. Self-demotion/self-disable and removing the last admin are
rejected (`self_lockout`, `last_admin`).

### Misc
| Method & path | Auth | Description |
|---|---|---|
| `GET /stats` | any role | Dashboard totals, storage, recent activity, upcoming schedule changes |
| `GET /search?q=` | any role | Slides, wallboards, media (+ users for admins) |
| `GET /notifications` | any role | Stored + derived (expiring slides, storage warnings) |
| `POST /notifications/mark-read` | any role | Mark all read |
| `GET /audit` | admin | Paginated; filters `q`, `action` prefix |
| `GET /system` | admin | Version, uptime, DB size, safe env info |

### Backup (admin)
| Method & path | Description |
|---|---|
| `GET /backup/export` | Config-only JSON (no password/PIN hashes) |
| `POST /backup/full` | Create zip (DB snapshot + export + media) in the backups dir |
| `GET /backup/records` | Backup history |
| `GET /backup/download/:id` | Download a zip |
| `DELETE /backup/records/:id` | Remove record + file |
| `POST /backup/validate` | Multipart `file`; validates manifest, returns counts |
| `POST /backup/restore` | Multipart `file` + field `confirm=true`; replaces content + settings transactionally; users untouched |
