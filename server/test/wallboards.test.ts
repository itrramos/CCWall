import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, setupAdmin, type TestApp } from './helpers.js';

describe('wallboard CRUD and playlist ordering', () => {
  let t: TestApp;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    t = createTestApp();
    admin = await setupAdmin(t.app);
  });
  afterAll(() => t.cleanup());

  async function makeSlide(title: string): Promise<string> {
    const res = await admin.post('/api/slides').send({ title, type: 'text', config: {} }).expect(201);
    return res.body.data.id as string;
  }

  it('creates a wallboard with a generated unique slug', async () => {
    const a = await admin.post('/api/wallboards').send({ name: 'Sales Floor' }).expect(201);
    const b = await admin.post('/api/wallboards').send({ name: 'Sales Floor' }).expect(201);
    expect(a.body.data.slug).toBe('sales-floor');
    expect(b.body.data.slug).toBe('sales-floor-2');
  });

  it('updates wallboard fields', async () => {
    const wb = await admin.post('/api/wallboards').send({ name: 'Edit me' }).expect(201);
    const updated = await admin
      .patch(`/api/wallboards/${wb.body.data.id}`)
      .send({ transition: 'zoom', defaultDuration: 30, enabled: false })
      .expect(200);
    expect(updated.body.data.transition).toBe('zoom');
    expect(updated.body.data.defaultDuration).toBe(30);
    expect(updated.body.data.enabled).toBe(false);
  });

  it('assigns and reorders slides', async () => {
    const wb = await admin.post('/api/wallboards').send({ name: 'Playlist' }).expect(201);
    const s1 = await makeSlide('One');
    const s2 = await makeSlide('Two');
    const s3 = await makeSlide('Three');
    await admin
      .put(`/api/wallboards/${wb.body.data.id}/slides`)
      .send({ slides: [{ slideId: s1 }, { slideId: s2 }, { slideId: s3, durationOverride: 45 }] })
      .expect(200);
    let got = await admin.get(`/api/wallboards/${wb.body.data.id}`).expect(200);
    expect(got.body.data.slides.map((s: { id: string }) => s.id)).toEqual([s1, s2, s3]);
    expect(got.body.data.slides[2].durationOverride).toBe(45);
    // Reorder: 3, 1, 2
    await admin
      .put(`/api/wallboards/${wb.body.data.id}/slides`)
      .send({ slides: [{ slideId: s3 }, { slideId: s1 }, { slideId: s2 }] })
      .expect(200);
    got = await admin.get(`/api/wallboards/${wb.body.data.id}`).expect(200);
    expect(got.body.data.slides.map((s: { id: string }) => s.id)).toEqual([s3, s1, s2]);
    expect(got.body.data.slides.map((s: { position: number }) => s.position)).toEqual([0, 1, 2]);
  });

  it('rejects duplicate or unknown slides in a playlist', async () => {
    const wb = await admin.post('/api/wallboards').send({ name: 'Bad playlist' }).expect(201);
    const s1 = await makeSlide('Dup');
    await admin
      .put(`/api/wallboards/${wb.body.data.id}/slides`)
      .send({ slides: [{ slideId: s1 }, { slideId: s1 }] })
      .expect(400);
    await admin
      .put(`/api/wallboards/${wb.body.data.id}/slides`)
      .send({ slides: [{ slideId: 'missing-id' }] })
      .expect(400);
  });

  it('duplicates a wallboard including its playlist', async () => {
    const wb = await admin.post('/api/wallboards').send({ name: 'To copy' }).expect(201);
    const s1 = await makeSlide('In copy');
    await admin
      .put(`/api/wallboards/${wb.body.data.id}/slides`)
      .send({ slides: [{ slideId: s1 }] })
      .expect(200);
    const copy = await admin.post(`/api/wallboards/${wb.body.data.id}/duplicate`).expect(201);
    expect(copy.body.data.name).toBe('To copy (copy)');
    expect(copy.body.data.slug).not.toBe(wb.body.data.slug);
    expect(copy.body.data.slides).toHaveLength(1);
  });

  it('generates a token when access=token and regenerates on demand', async () => {
    const wb = await admin.post('/api/wallboards').send({ name: 'Secret', access: 'token' }).expect(201);
    const token1 = wb.body.data.accessToken;
    expect(token1).toBeTruthy();
    const regen = await admin.post(`/api/wallboards/${wb.body.data.id}/regenerate-token`).expect(200);
    expect(regen.body.data.accessToken).not.toBe(token1);
  });

  it('requires a PIN when access=pin', async () => {
    await admin.post('/api/wallboards').send({ name: 'Pinless', access: 'pin' }).expect(400);
    const ok = await admin.post('/api/wallboards').send({ name: 'Pinned', access: 'pin', pin: '1234' }).expect(201);
    expect(ok.body.data.hasPin).toBe(true);
  });

  it('deletes a wallboard without deleting its slides', async () => {
    const wb = await admin.post('/api/wallboards').send({ name: 'Deleting' }).expect(201);
    const s1 = await makeSlide('Survivor');
    await admin.put(`/api/wallboards/${wb.body.data.id}/slides`).send({ slides: [{ slideId: s1 }] }).expect(200);
    await admin.delete(`/api/wallboards/${wb.body.data.id}`).expect(200);
    await admin.get(`/api/wallboards/${wb.body.data.id}`).expect(404);
    await admin.get(`/api/slides/${s1}`).expect(200);
  });
});
