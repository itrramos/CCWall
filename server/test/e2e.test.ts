import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ADMIN, createTestApp, PNG_1PX, type TestApp } from './helpers.js';

/**
 * End-to-end workflow (API-driven, against the real app):
 * setup → login → create wallboard → add text + image slides → reorder →
 * save settings → open the live display.
 */
describe('end-to-end workflow', () => {
  let t: TestApp;
  beforeAll(() => {
    t = createTestApp();
  });
  afterAll(() => t.cleanup());

  it('runs the complete admin-to-display journey', async () => {
    // 1. First-run setup.
    const status = await request(t.app).get('/api/auth/status').expect(200);
    expect(status.body.data.needsSetup).toBe(true);
    await request(t.app).post('/api/setup').send(ADMIN).expect(201);

    // 2. Log in (fresh session, not the setup cookie).
    const agent = request.agent(t.app);
    await agent
      .post('/api/auth/login')
      .send({ usernameOrEmail: ADMIN.username, password: ADMIN.password, remember: true })
      .expect(200);

    // 3. Create a wallboard.
    const wb = await agent
      .post('/api/wallboards')
      .send({ name: 'Main Lobby', description: 'Front-of-house display', transition: 'fade' })
      .expect(201);
    const wbId = wb.body.data.id as string;
    expect(wb.body.data.slug).toBe('main-lobby');

    // 4. Add a text slide and an image slide.
    const text = await agent
      .post('/api/slides')
      .send({
        title: 'Welcome',
        type: 'text',
        duration: 10,
        config: { heading: 'Welcome to **CCWall**', body: 'Have a great day' }
      })
      .expect(201);
    const upload = await agent.post('/api/media').attach('file', PNG_1PX, 'logo.png').expect(201);
    const image = await agent
      .post('/api/slides')
      .send({
        title: 'Team photo',
        type: 'image',
        config: { mediaId: upload.body.data.id, mediaUrl: upload.body.data.url, fit: 'cover' }
      })
      .expect(201);
    await agent
      .put(`/api/wallboards/${wbId}/slides`)
      .send({ slides: [{ slideId: text.body.data.id }, { slideId: image.body.data.id }] })
      .expect(200);

    // 5. Reorder the slides (image first).
    const reordered = await agent
      .put(`/api/wallboards/${wbId}/slides`)
      .send({ slides: [{ slideId: image.body.data.id }, { slideId: text.body.data.id }] })
      .expect(200);
    expect(reordered.body.data.slides.map((s: { title: string }) => s.title)).toEqual([
      'Team photo',
      'Welcome'
    ]);

    // 6. Save settings.
    await agent
      .put('/api/settings/general')
      .send({ appName: 'Lobby Ops', defaultWallboardId: wbId })
      .expect(200);
    const settings = await agent.get('/api/settings').expect(200);
    expect(settings.body.data.general.defaultWallboardId).toBe(wbId);

    // 7. Open the live display (public route + playlist API + media asset).
    const page = await request(t.app).get('/display/main-lobby').expect(200);
    expect(page.headers['content-type']).toContain('text/html');
    const playlist = await request(t.app).get('/api/display/main-lobby').expect(200);
    expect(playlist.body.data.slides).toHaveLength(2);
    expect(playlist.body.data.slides[0].title).toBe('Team photo');
    await request(t.app).get(playlist.body.data.slides[0].config.mediaUrl).expect(200);

    // Dashboard reflects the new content.
    const stats = await agent.get('/api/stats').expect(200);
    expect(stats.body.data.totals.wallboards).toBe(1);
    expect(stats.body.data.totals.slides).toBe(2);
  });
});
