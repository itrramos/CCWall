import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, createUserAgent, setupAdmin, type TestApp } from './helpers.js';

describe('role-based access control', () => {
  let t: TestApp;
  let admin: ReturnType<typeof request.agent>;
  let editor: ReturnType<typeof request.agent>;
  let viewer: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    t = createTestApp();
    admin = await setupAdmin(t.app);
    editor = await createUserAgent(t.app, admin, 'editor');
    viewer = await createUserAgent(t.app, admin, 'viewer');
  });
  afterAll(() => t.cleanup());

  it('requires authentication for protected endpoints', async () => {
    await request(t.app).get('/api/slides').expect(401);
    await request(t.app).get('/api/stats').expect(401);
  });

  it('lets editors manage content but not users or settings', async () => {
    await editor.post('/api/slides').send({ title: 'E1', type: 'text', config: {} }).expect(201);
    await editor.get('/api/users').expect(403);
    await editor.put('/api/settings/security').send({ maxLoginAttempts: 5 }).expect(403);
    await editor.get('/api/audit').expect(403);
    await editor.post('/api/backup/full').expect(403);
  });

  it('lets viewers read but not write', async () => {
    await viewer.get('/api/slides').expect(200);
    await viewer.get('/api/wallboards').expect(200);
    await viewer.post('/api/slides').send({ title: 'V1', type: 'text', config: {} }).expect(403);
    await viewer.post('/api/wallboards').send({ name: 'V' }).expect(403);
    await viewer.get('/api/users').expect(403);
  });

  it('embedded HTML slides: admin-only, and blocked entirely when disabled', async () => {
    // Enabled by default — admins may create them, editors never can.
    await editor
      .post('/api/slides')
      .send({ title: 'H', type: 'html', config: { html: '<b>x</b>' } })
      .expect(403);
    await admin
      .post('/api/slides')
      .send({ title: 'H', type: 'html', config: { html: '<b>x</b>' } })
      .expect(201);
    // The security switch turns the type off for everyone, including admins.
    await admin.put('/api/settings/security').send({ allowEmbeddedHtml: false }).expect(200);
    const blocked = await admin
      .post('/api/slides')
      .send({ title: 'H2', type: 'html', config: { html: '<b>x</b>' } })
      .expect(403);
    expect(blocked.body.error.code).toBe('html_disabled');
    await admin.put('/api/settings/security').send({ allowEmbeddedHtml: true }).expect(200);
  });

  it('protects the last administrator from demotion and deletion', async () => {
    const me = await admin.get('/api/auth/me').expect(200);
    const myId = me.body.data.user.id;
    await admin.delete(`/api/users/${myId}`).expect(400);
    await admin.patch(`/api/users/${myId}`).send({ role: 'viewer' }).expect(400);
  });
});
