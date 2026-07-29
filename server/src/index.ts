import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { createApp } from './app.js';
import { log, setLogLevel } from './logger.js';
import { getSettingsGroup } from './lib/settings.js';
import { pruneExpiredSessions } from './lib/sessions.js';
import { pruneAuditLogs } from './lib/audit.js';
import type { AppContext } from './types.js';

const config = loadConfig();
setLogLevel(config.logLevel);
const db = openDb(config.dbPath);

// Settings-configured log level wins over the env default once the DB exists.
setLogLevel(getSettingsGroup(db, 'system').logLevel);

const ctx: AppContext = { db, config, startedAt: Date.now() };
const app = createApp(ctx);

const server = app.listen(config.port, () => {
  log.info('ccwall started', {
    port: config.port,
    dataDir: config.dataDir,
    nodeEnv: config.nodeEnv,
    version: config.version
  });
});

// Hourly maintenance: expired sessions + audit retention.
const maintenance = setInterval(() => {
  try {
    pruneExpiredSessions(db);
    pruneAuditLogs(db, getSettingsGroup(db, 'system').auditRetentionDays);
  } catch (err) {
    log.warn('maintenance failed', { error: String(err) });
  }
}, 60 * 60 * 1000);
maintenance.unref();

function shutdown(signal: string): void {
  log.info('shutting down', { signal });
  clearInterval(maintenance);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    process.exit(0);
  });
  // Force-exit if connections refuse to drain.
  setTimeout(() => process.exit(0), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
