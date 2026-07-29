import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import compression from 'compression';
import type { AppContext } from './types.js';
import { errorHandler, ok, ApiError } from './lib/http.js';
import { attachUser } from './middleware/auth.js';
import { csrfProtect } from './middleware/csrf.js';
import { rateLimit } from './lib/ratelimit.js';
import { getSettingsGroup } from './lib/settings.js';
import { authRoutes, userCount } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { slideRoutes } from './routes/slides.js';
import { wallboardRoutes } from './routes/wallboards.js';
import { mediaRoutes } from './routes/media.js';
import { settingsRoutes } from './routes/settings.js';
import { displayRoutes } from './routes/display.js';
import { miscRoutes } from './routes/misc.js';
import { backupRoutes } from './routes/backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' blob: https: http:",
  // URL/report slides intentionally embed external pages.
  'frame-src https: http:',
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'"
].join('; ');

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', ctx.config.trustProxy);
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // strict-origin-when-cross-origin (not same-origin): embedded players such
    // as YouTube require a Referer/origin to validate the embedding site —
    // with no referrer at all they fail with "Error 153".
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', CSP);
    next();
  });

  // ---- health (no auth, no session lookups) ----
  app.get('/api/health', (_req, res) => {
    ok(res, { status: 'ok', version: ctx.config.version });
  });
  app.get('/api/ready', (_req, res) => {
    try {
      ctx.db.prepare('SELECT 1').get();
      ok(res, { ready: true });
    } catch {
      res.status(503).json({ ok: false, error: { code: 'not_ready', message: 'Database unavailable' } });
    }
  });

  app.use('/api', attachUser(ctx));
  app.use('/api', csrfProtect(ctx));
  app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 600 }));

  // Branding + first-run state for login/setup/display pages (public).
  app.get('/api/public-config', (_req, res) => {
    const general = getSettingsGroup(ctx.db, 'general');
    ok(res, {
      appName: general.appName,
      subtitle: general.subtitle,
      defaultTheme: general.defaultTheme,
      logoMediaId: general.logoMediaId,
      needsSetup: userCount(ctx) === 0
    });
  });

  app.use('/api', authRoutes(ctx));
  app.use('/api', displayRoutes(ctx));
  app.use('/api', userRoutes(ctx));
  app.use('/api', slideRoutes(ctx));
  app.use('/api', wallboardRoutes(ctx));
  app.use('/api', mediaRoutes(ctx));
  app.use('/api', settingsRoutes(ctx));
  app.use('/api', miscRoutes(ctx));
  app.use('/api', backupRoutes(ctx));

  app.use('/api', (_req, _res, next) => {
    next(new ApiError(404, 'not_found', 'Unknown API endpoint'));
  });

  // ---- uploaded media (public: the display player needs it without login) ----
  app.use(
    '/media',
    express.static(ctx.config.uploadsDir, {
      fallthrough: false,
      immutable: true,
      maxAge: '30d',
      dotfiles: 'deny'
    })
  );

  // ---- built SPA ----
  const webDist = process.env.WEB_DIST ?? path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(
      express.static(webDist, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-cache');
          }
        }
      })
    );
    app.get(/(.*)/, (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/media')) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  // Express 5: async errors propagate here automatically.
  app.use(errorHandler);
  return app;
}
