import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, PNG_1PX, setupAdmin, type TestApp } from './helpers.js';

describe('backup and restore', () => {
  let t: TestApp;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    t = createTestApp();
    admin = await setupAdmin(t.app);
    const wb = await admin.post('/api/wallboards').send({ name: 'Backed up' }).expect(201);
    const slide = await admin.post('/api/slides').send({ title: 'Kept', type: 'text', config: {} }).expect(201);
    await admin
      .put(`/api/wallboards/${wb.body.data.id}/slides`)
      .send({ slides: [{ slideId: slide.body.data.id }] })
      .expect(200);
    await admin.post('/api/media').attach('file', PNG_1PX, 'asset.png').expect(201);
  });
  afterAll(() => t.cleanup());

  it('config export contains content but no password or PIN hashes', async () => {
    const res = await admin.get('/api/backup/export').expect(200);
    const body = JSON.stringify(res.body);
    expect(res.body.manifest.app).toBe('ccwall');
    expect(res.body.wallboards).toHaveLength(1);
    expect(res.body.slides).toHaveLength(1);
    expect(res.body.users[0].password_hash).toBeUndefined();
    expect(body).not.toContain('$2b$');
  });

  it('creates a downloadable full backup zip', async () => {
    const rec = await admin.post('/api/backup/full').expect(201);
    expect(rec.body.data.size).toBeGreaterThan(0);
    const dl = await admin.get(`/api/backup/download/${rec.body.data.id}`).expect(200);
    expect(dl.headers['content-disposition']).toContain('.zip');
    const records = await admin.get('/api/backup/records').expect(200);
    expect(records.body.data.items[0].status).toBe('ok');
  });

  it('validates uploads and refuses restore without confirmation', async () => {
    const bundle = (await admin.get('/api/backup/export').expect(200)).body;
    const buf = Buffer.from(JSON.stringify(bundle));
    const valid = await admin.post('/api/backup/validate').attach('file', buf, 'export.json').expect(200);
    expect(valid.body.data.counts.slides).toBe(1);
    await admin.post('/api/backup/restore').attach('file', buf, 'export.json').expect(400);
    const junk = await admin
      .post('/api/backup/validate')
      .attach('file', Buffer.from('{"nope":true}'), 'junk.json')
      .expect(400);
    expect(junk.body.error.code).toBe('invalid_backup');
  });

  it('restores content from an export after wiping it', async () => {
    const bundle = (await admin.get('/api/backup/export').expect(200)).body;
    // Wipe current content.
    const wbs = await admin.get('/api/wallboards').expect(200);
    for (const w of wbs.body.data.items) await admin.delete(`/api/wallboards/${w.id}`).expect(200);
    const slides = await admin.get('/api/slides').expect(200);
    for (const s of slides.body.data.items) await admin.delete(`/api/slides/${s.id}`).expect(200);
    // Restore.
    await admin
      .post('/api/backup/restore')
      .field('confirm', 'true')
      .attach('file', Buffer.from(JSON.stringify(bundle)), 'export.json')
      .expect(200);
    const after = await admin.get('/api/wallboards').expect(200);
    expect(after.body.data.items).toHaveLength(1);
    expect(after.body.data.items[0].name).toBe('Backed up');
    const afterSlides = await admin.get('/api/slides').expect(200);
    expect(afterSlides.body.data.items).toHaveLength(1);
  });
});
