import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, setupAdmin, type TestApp } from './helpers.js';

describe('slide CRUD and validation', () => {
  let t: TestApp;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    t = createTestApp();
    admin = await setupAdmin(t.app);
  });
  afterAll(() => t.cleanup());

  it('creates a text slide with defaults applied to config', async () => {
    const res = await admin
      .post('/api/slides')
      .send({ title: 'Hello', type: 'text', config: { heading: 'Hi', body: 'World' } })
      .expect(201);
    expect(res.body.data.config.align).toBe('center');
    expect(res.body.data.enabled).toBe(true);
  });

  it('rejects invalid payloads with field-level details', async () => {
    const noTitle = await admin.post('/api/slides').send({ type: 'text', config: {} }).expect(400);
    expect(noTitle.body.error.code).toBe('validation_error');
    const badType = await admin.post('/api/slides').send({ title: 'X', type: 'nope', config: {} }).expect(400);
    expect(badType.body.error.code).toBe('validation_error');
    const badUrl = await admin
      .post('/api/slides')
      .send({ title: 'X', type: 'url', config: { url: 'javascript:alert(1)' } })
      .expect(400);
    expect(JSON.stringify(badUrl.body.error.details)).toContain('config.url');
  });

  it('updates a slide and preserves unspecified fields', async () => {
    const created = await admin
      .post('/api/slides')
      .send({ title: 'Patch me', type: 'text', config: { heading: 'A' }, tags: 'one' })
      .expect(201);
    const updated = await admin
      .patch(`/api/slides/${created.body.data.id}`)
      .send({ enabled: false })
      .expect(200);
    expect(updated.body.data.enabled).toBe(false);
    expect(updated.body.data.tags).toBe('one');
    expect(updated.body.data.config.heading).toBe('A');
  });

  it('duplicates a slide with a (copy) suffix', async () => {
    const created = await admin
      .post('/api/slides')
      .send({ title: 'Original', type: 'clock', config: {} })
      .expect(201);
    const copy = await admin.post(`/api/slides/${created.body.data.id}/duplicate`).expect(201);
    expect(copy.body.data.title).toBe('Original (copy)');
    expect(copy.body.data.type).toBe('clock');
    expect(copy.body.data.id).not.toBe(created.body.data.id);
  });

  it('stores scheduling fields', async () => {
    const res = await admin
      .post('/api/slides')
      .send({
        title: 'Scheduled',
        type: 'text',
        config: {},
        startAt: '2026-01-01T00:00:00.000Z',
        endAt: '2026-12-31T00:00:00.000Z',
        daysOfWeek: [1, 2, 3]
      })
      .expect(201);
    expect(res.body.data.daysOfWeek).toEqual([1, 2, 3]);
    expect(res.body.data.startAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('filters and paginates the slide list', async () => {
    const list = await admin.get('/api/slides?type=text&pageSize=2&page=1').expect(200);
    expect(list.body.data.items.length).toBeLessThanOrEqual(2);
    for (const s of list.body.data.items) expect(s.type).toBe('text');
    expect(list.body.data.total).toBeGreaterThan(0);
  });

  it('deletes a slide and removes it from playlists', async () => {
    const slide = await admin.post('/api/slides').send({ title: 'Doomed', type: 'blank', config: {} }).expect(201);
    const wb = await admin.post('/api/wallboards').send({ name: 'Holder' }).expect(201);
    await admin
      .put(`/api/wallboards/${wb.body.data.id}/slides`)
      .send({ slides: [{ slideId: slide.body.data.id }] })
      .expect(200);
    await admin.delete(`/api/slides/${slide.body.data.id}`).expect(200);
    const after = await admin.get(`/api/wallboards/${wb.body.data.id}`).expect(200);
    expect(after.body.data.slides).toHaveLength(0);
    await admin.get(`/api/slides/${slide.body.data.id}`).expect(404);
  });
});
