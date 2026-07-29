import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { openDb } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import type { AppContext } from '../src/types.js';

export interface TestApp {
  app: Express;
  ctx: AppContext;
  cleanup: () => void;
}

export function createTestApp(): TestApp {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccwall-test-'));
  const uploadsDir = path.join(dataDir, 'uploads');
  const backupsDir = path.join(dataDir, 'backups');
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
  const dbPath = path.join(dataDir, 'test.db');
  const db = openDb(dbPath);
  const ctx: AppContext = {
    db,
    config: {
      port: 0,
      dataDir,
      uploadsDir,
      backupsDir,
      dbPath,
      sessionSecret: 'test-secret-test-secret-test-secret',
      trustProxy: false,
      logLevel: 'error',
      maxUploadSizeMb: 10,
      nodeEnv: 'test',
      version: '1.0.0-test'
    },
    startedAt: Date.now()
  };
  const app = createApp(ctx);
  return {
    app,
    ctx,
    cleanup: () => {
      try {
        db.close();
      } catch {
        /* already closed */
      }
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

export const ADMIN = { username: 'admin', password: 'Admin#Pass123', displayName: 'Admin' };

/** Completes first-run setup and returns an authenticated admin agent. */
export async function setupAdmin(app: Express): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  await agent.post('/api/setup').send(ADMIN).expect(201);
  return agent;
}

/** Creates a user with the given role and returns a logged-in agent for it. */
export async function createUserAgent(
  app: Express,
  adminAgent: ReturnType<typeof request.agent>,
  role: 'admin' | 'editor' | 'viewer'
): Promise<ReturnType<typeof request.agent>> {
  const username = `${role}user`;
  const password = `${role[0]!.toUpperCase()}${role}Pass#123`;
  await adminAgent
    .post('/api/users')
    .send({ username, password, role, displayName: role, email: null })
    .expect(201);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ usernameOrEmail: username, password }).expect(200);
  return agent;
}

export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
