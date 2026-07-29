import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ADMIN, createTestApp, setupAdmin, type TestApp } from './helpers.js';

describe('authentication', () => {
  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });
  afterEach(() => t.cleanup());

  it('reports needsSetup until the first admin exists', async () => {
    const res = await request(t.app).get('/api/auth/status').expect(200);
    expect(res.body.data.needsSetup).toBe(true);
  });

  it('rejects weak passwords during setup', async () => {
    const res = await request(t.app)
      .post('/api/setup')
      .send({ username: 'admin', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('weak_password');
  });

  it('completes setup once and refuses a second time', async () => {
    await setupAdmin(t.app);
    const res = await request(t.app).post('/api/setup').send(ADMIN).expect(409);
    expect(res.body.error.code).toBe('already_setup');
  });

  it('logs in with valid credentials and sets an HttpOnly cookie', async () => {
    await setupAdmin(t.app);
    const res = await request(t.app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: ADMIN.username, password: ADMIN.password })
      .expect(200);
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('ccwall_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(res.body.data.role).toBe('admin');
  });

  it('rejects invalid credentials without leaking which field failed', async () => {
    await setupAdmin(t.app);
    const bad = await request(t.app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: ADMIN.username, password: 'WrongPass#123' })
      .expect(401);
    const unknown = await request(t.app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'ghost', password: 'WrongPass#123' })
      .expect(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks the account after repeated failures', async () => {
    const admin = await setupAdmin(t.app);
    await admin.put('/api/settings/security').send({ maxLoginAttempts: 3, lockoutMinutes: 15 }).expect(200);
    for (let i = 0; i < 3; i++) {
      await request(t.app)
        .post('/api/auth/login')
        .send({ usernameOrEmail: ADMIN.username, password: 'Nope#12345' })
        .expect(401);
    }
    const locked = await request(t.app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: ADMIN.username, password: ADMIN.password })
      .expect(423);
    expect(locked.body.error.code).toBe('account_locked');
  });

  it('logs out and invalidates the session', async () => {
    const admin = await setupAdmin(t.app);
    await admin.get('/api/auth/me').expect(200);
    await admin.post('/api/auth/logout').expect(200);
    await admin.get('/api/auth/me').expect(401);
  });

  it('changes password with policy enforcement and keeps only the new session', async () => {
    const admin = await setupAdmin(t.app);
    await admin
      .post('/api/auth/change-password')
      .send({ currentPassword: ADMIN.password, newPassword: 'weak' })
      .expect(400);
    await admin
      .post('/api/auth/change-password')
      .send({ currentPassword: ADMIN.password, newPassword: 'NewPass#4567' })
      .expect(200);
    await admin.get('/api/auth/me').expect(200);
    await request(t.app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: ADMIN.username, password: 'NewPass#4567' })
      .expect(200);
  });

  it('records login attempts in the audit log', async () => {
    const admin = await setupAdmin(t.app);
    await request(t.app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: ADMIN.username, password: 'Bad#Pass9999' })
      .expect(401);
    const res = await admin.get('/api/audit?action=auth').expect(200);
    const actions = res.body.data.items.map((i: { action: string }) => i.action);
    expect(actions).toContain('auth.login_failed');
  });

  it('rejects cross-origin state-changing requests (CSRF)', async () => {
    await setupAdmin(t.app);
    const res = await request(t.app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example.com')
      .send({ usernameOrEmail: ADMIN.username, password: ADMIN.password })
      .expect(403);
    expect(res.body.error.code).toBe('csrf_rejected');
  });
});
