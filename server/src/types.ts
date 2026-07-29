import type { Db } from './db/index.js';
import type { AppConfig } from './config.js';
import type { SessionUser } from './lib/sessions.js';

export interface AppContext {
  db: Db;
  config: AppConfig;
  startedAt: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionToken?: string;
    }
  }
}
