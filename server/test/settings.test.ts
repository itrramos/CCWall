import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, setupAdmin, type TestApp } from './helpers.js';
import { getSettingsGroup } from '../src/lib/settings.js';

describe('settings persistence and validation', () => {
  let t: TestApp;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    t = createTestApp();
    admin = await setupAdmin(t.app);
  });
  afterAll(() => t.cleanup());

  it('returns defaults before any changes', async () => {
    const res = await admin.get('/api/settings').expect(200);
    expect(res.body.data.general.appName).toBe('CCWall');
    expect(res.body.data.security.passwordMinLength).toBe(10);
    expect(res.body.data.wallboard.loopSlides).toBe(true);
  });

  it('persists partial updates and survives a fresh read (restart-equivalent)', async () => {
    await admin
      .put('/api/settings/general')
      .send({ appName: 'Ops Wall', defaultSlideDuration: 25 })
      .expect(200);
    const res = await admin.get('/api/settings').expect(200);
    expect(res.body.data.general.appName).toBe('Ops Wall');
    expect(res.body.data.general.defaultSlideDuration).toBe(25);
    expect(res.body.data.general.subtitle).toBe('Wallboard Portal');
    // Read straight from the DB — proves values are stored, not cached.
    expect(getSettingsGroup(t.ctx.db, 'general').appName).toBe('Ops Wall');
  });

  it('rejects invalid settings values', async () => {
    await admin.put('/api/settings/general').send({ defaultSlideDuration: -5 }).expect(400);
    await admin.put('/api/settings/security').send({ passwordMinLength: 1 }).expect(400);
    await admin.put('/api/settings/nonsense').send({}).expect(404);
  });

  it('exposes public branding without authentication', async () => {
    const res = await request(t.app).get('/api/public-config').expect(200);
    expect(res.body.data.appName).toBe('Ops Wall');
    expect(res.body.data.needsSetup).toBe(false);
  });

  it('records settings changes in the audit log', async () => {
    await admin.put('/api/settings/system').send({ logLevel: 'warn' }).expect(200);
    const res = await admin.get('/api/audit?action=settings').expect(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items[0].details).toContain('logLevel');
  });
});
