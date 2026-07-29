# Security Policy

## Reporting

CCWall is self-hosted software. If you find a vulnerability, please open a private report to
the repository maintainer rather than a public issue, and include reproduction steps.

## Security model

| Area | Implementation |
|---|---|
| Password storage | bcrypt, cost factor 12; policy (length, classes) enforced server-side |
| Sessions | Random 256-bit tokens stored hashed (SHA-256) server-side; HttpOnly + SameSite=Lax cookies; `Secure` flag over HTTPS; idle timeout and remember-me duration configurable |
| CSRF | SameSite=Lax cookies plus an Origin-header check on every state-changing request; extra origins allowlisted in Settings → Security |
| Brute force | Per-IP rate limiting on auth endpoints plus per-account escalating lockout |
| Authorization | Role-based (admin / editor / viewer) checks on every protected endpoint |
| Display access | Per-wallboard public / secret-token / PIN modes; global kill-switch for public display access; PINs stored hashed |
| Embedded HTML | Admin-only; rendered in an iframe with an empty `sandbox` attribute so scripts never execute; can be disabled globally in Settings → Security |
| Uploads | Extension + MIME allowlist, configurable size limit, random generated file names, no client-controlled paths |
| Headers | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; no `x-powered-by` |
| Errors | Central handler; stack traces are never sent to clients |
| Audit | Auth events, user/content/settings changes, backups, media operations — never passwords, tokens or sensitive headers |
| Exports | Config exports exclude password and PIN hashes; full backups contain the raw DB and must be stored securely |
| Secrets | `SESSION_SECRET` from env or generated with `crypto.randomBytes` and persisted with mode 0600 |

## Deployment recommendations

- Terminate TLS in a reverse proxy and set `TRUST_PROXY=true`.
- Keep the container non-public; expose only port 5599 (or your proxy).
- Restrict who gets the *admin* role; use *editor* for content managers and *viewer* for
  read-only dashboards.
- Disable **Embedded HTML slides** (Settings → Security) if you don't trust every administrator.
- Treat full backup zips as sensitive material.
