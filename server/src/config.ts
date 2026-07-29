import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  port: number;
  dataDir: string;
  uploadsDir: string;
  backupsDir: string;
  dbPath: string;
  sessionSecret: string;
  trustProxy: boolean | number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxUploadSizeMb: number;
  nodeEnv: string;
  version: string;
}

function parseTrustProxy(raw: string | undefined): boolean | number {
  if (!raw || raw === 'false' || raw === '0') return false;
  if (raw === 'true') return true;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : true;
}

/**
 * Loads the session secret from env, or generates a random one persisted in
 * the data directory so sessions survive container restarts.
 */
function loadSessionSecret(dataDir: string): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const secretFile = path.join(dataDir, 'session-secret');
  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* first run */
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  return secret;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dataDir = overrides.dataDir ?? process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
  const uploadsDir = path.join(dataDir, 'uploads');
  const backupsDir = path.join(dataDir, 'backups');
  for (const dir of [dataDir, uploadsDir, backupsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const rawLevel = process.env.LOG_LEVEL ?? 'info';
  const logLevel = (['debug', 'info', 'warn', 'error'] as const).includes(
    rawLevel as 'info'
  )
    ? (rawLevel as AppConfig['logLevel'])
    : 'info';
  return {
    port: overrides.port ?? Number(process.env.PORT ?? 5599),
    dataDir,
    uploadsDir,
    backupsDir,
    dbPath: overrides.dbPath ?? path.join(dataDir, 'ccwall.db'),
    sessionSecret: overrides.sessionSecret ?? loadSessionSecret(dataDir),
    trustProxy: overrides.trustProxy ?? parseTrustProxy(process.env.TRUST_PROXY),
    logLevel: overrides.logLevel ?? logLevel,
    maxUploadSizeMb: overrides.maxUploadSizeMb ?? Number(process.env.MAX_UPLOAD_SIZE_MB ?? 200),
    nodeEnv: overrides.nodeEnv ?? process.env.NODE_ENV ?? 'development',
    version: '1.2.0'
  };
}
