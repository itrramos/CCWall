import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, setupAdmin, type TestApp } from './helpers.js';

describe('public display access', () => {
  let t: TestApp;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    t = createTestApp();
    admin = await setupAdmin(t.app);
  });
  afterAll(() => t.cleanup());

  it('serves a public wallboard playlist without authentication', async () => {
    const wb = await admin.post('/api/wallboards').send({ name: 'Lobby' }).expect(201);
    const slide = await admin
      .post('/api/slides')
      .send({ title: 'Visible', type: 'text', config: { heading: 'Hi' } })
      .expect(201);
    await admin
      .put(`/api/wallboards/${wb.body.data.id}/slides`)
      .send({ slides: [{ slideId: slide.body.data.id }] })
      .expect(200);
    const res = await request(t.app).get('/api/display/lobby').expect(200);
    expect(res.body.data.slides).toHaveLength(1);
    expect(res.body.data.wallboard.accessToken).toBeUndefined();
    expect(res.body.data.version).toBeTruthy();
  });

  it('returns 404 for disabled or unknown wallboards', async () => {
    const wb = await admin.post('/api/wallboards').send({ name: 'Hidden', enabled: false }).expect(201);
    await request(t.app).get(`/api/display/${wb.body.data.slug}`).expect(404);
    await request(t.app).get('/api/display/does-not-exist').expect(404);
  });

  it('enforces token access', async () => {
    const wb = await admin.post('/api/wallboards').send({ name: 'Tokenized', access: 'token' }).expect(201);
    const token = wb.body.data.accessToken as string;
    await request(t.app).get(`/api/display/${wb.body.data.slug}`).expect(401);
    await request(t.app).get(`/api/display/${wb.body.data.slug}?token=wrong`).expect(401);
    await request(t.app).get(`/api/display/${wb.body.data.slug}?token=${token}`).expect(200);
  });

  it('enforces PIN access', async () => {
    const wb = await admin
      .post('/api/wallboards')
      .send({ name: 'Pin board', access: 'pin', pin: '4321' })
      .expect(201);
    await request(t.app).get(`/api/display/${wb.body.data.slug}`).expect(401);
    await request(t.app).get(`/api/display/${wb.body.data.slug}?pin=0000`).expect(401);
    await request(t.app).get(`/api/display/${wb.body.data.slug}?pin=4321`).expect(200);
  });

  it('lets authenticated users bypass token/PIN (dashboard preview)', async () => {
    const wb = await admin
      .post('/api/wallboards')
      .send({ name: 'Preview me', access: 'token' })
      .expect(201);
    await admin.get(`/api/display/${wb.body.data.slug}`).expect(200);
  });

  it('honors the global public display access switch', async () => {
    const wb = await admin.post('/api/wallboards').send({ name: 'Gated' }).expect(201);
    await admin.put('/api/settings/security').send({ publicDisplayAccess: false }).expect(200);
    await request(t.app).get(`/api/display/${wb.body.data.slug}`).expect(403);
    await admin.get(`/api/display/${wb.body.data.slug}`).expect(200);
    await admin.put('/api/settings/security').send({ publicDisplayAccess: true }).expect(200);
    await request(t.app).get(`/api/display/${wb.body.data.slug}`).expect(200);
  });

  it('filters out disabled and expired slides from the playlist', async () => {
    const wb = await admin.post('/api/wallboards').send({ name: 'Filtered' }).expect(201);
    const active = await admin.post('/api/slides').send({ title: 'Active', type: 'text', config: {} }).expect(201);
    const disabled = await admin
      .post('/api/slides')
      .send({ title: 'Disabled', type: 'text', config: {}, enabled: false })
      .expect(201);
    const expired = await admin
      .post('/api/slides')
      .send({ title: 'Expired', type: 'text', config: {}, endAt: '2020-01-01T00:00:00.000Z' })
      .expect(201);
    const future = await admin
      .post('/api/slides')
      .send({ title: 'Future', type: 'text', config: {}, startAt: '2100-01-01T00:00:00.000Z' })
      .expect(201);
    await admin
      .put(`/api/wallboards/${wb.body.data.id}/slides`)
      .send({
        slides: [
          { slideId: active.body.data.id },
          { slideId: disabled.body.data.id },
          { slideId: expired.body.data.id },
          { slideId: future.body.data.id }
        ]
      })
      .expect(200);
    const res = await request(t.app).get(`/api/display/${wb.body.data.slug}`).expect(200);
    const titles = res.body.data.slides.map((s: { title: string }) => s.title);
    expect(titles).toEqual(['Active']);
  });

  it('reports onAir=false outside the wallboard schedule', async () => {
    const wb = await admin
      .post('/api/wallboards')
      .send({
        name: 'Night owl',
        schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '00:01' }
      })
      .expect(201);
    const res = await request(t.app).get(`/api/display/${wb.body.data.slug}`).expect(200);
    // Unless the test runs exactly at midnight, this window is closed.
    const now = new Date();
    const inWindow = now.getHours() === 0 && now.getMinutes() === 0;
    expect(res.body.data.onAir).toBe(inWindow);
  });
});
