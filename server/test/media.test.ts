import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, PNG_1PX, setupAdmin, type TestApp } from './helpers.js';

describe('media upload validation and delete protection', () => {
  let t: TestApp;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    t = createTestApp();
    admin = await setupAdmin(t.app);
  });
  afterAll(() => t.cleanup());

  it('uploads a PNG and generates a safe random file name', async () => {
    const res = await admin.post('/api/media').attach('file', PNG_1PX, 'team photo (1).png').expect(201);
    expect(res.body.data.kind).toBe('image');
    expect(res.body.data.originalName).toBe('team photo (1).png');
    // Generated name: uuid + extension, no spaces or traversal characters.
    expect(res.body.data.fileName).toMatch(/^[0-9a-f-]{36}\.png$/);
    // Served publicly for the display player:
    await request(t.app).get(res.body.data.url).expect(200);
  });

  it('rejects disallowed file types', async () => {
    const res = await admin
      .post('/api/media')
      .attach('file', Buffer.from('MZ...'), 'malware.exe')
      .expect(400);
    expect(res.body.error.code).toBe('invalid_type');
  });

  it('enforces the configured size limit', async () => {
    await admin.put('/api/settings/storage').send({ maxUploadSizeMb: 1 }).expect(200);
    const big = Buffer.alloc(1024 * 1024 + 10, 1);
    const res = await admin.post('/api/media').attach('file', big, 'big.png').expect(413);
    expect(res.body.error.code).toBe('file_too_large');
    await admin.put('/api/settings/storage').send({ maxUploadSizeMb: 10 }).expect(200);
  });

  it('blocks path traversal on the media route', async () => {
    await request(t.app).get('/media/..%2f..%2ftest.db').expect(403);
    await request(t.app).get('/media/nonexistent.png').expect(404);
  });

  it('protects assets that are in use and reports usage', async () => {
    const upload = await admin.post('/api/media').attach('file', PNG_1PX, 'used.png').expect(201);
    const mediaId = upload.body.data.id as string;
    const slide = await admin
      .post('/api/slides')
      .send({ title: 'Uses image', type: 'image', config: { mediaId, mediaUrl: upload.body.data.url } })
      .expect(201);
    const usage = await admin.get(`/api/media/${mediaId}/usage`).expect(200);
    expect(usage.body.data.usedBy.map((u: { id: string }) => u.id)).toContain(slide.body.data.id);
    const blocked = await admin.delete(`/api/media/${mediaId}`).expect(409);
    expect(blocked.body.error.code).toBe('in_use');
    await admin.delete(`/api/media/${mediaId}?force=true`).expect(200);
  });
});
