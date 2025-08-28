import express from 'express';
import request from 'supertest';

import { setAppConfiguration, TestAppConfiguration } from '../src/config/appConfig.js';

// Mock jose to allow normal-user auth
const mockJwtVerify = jest.fn();
jest.mock('jose', () => ({
  createRemoteJWKSet: () => ({} as any),
  jwtVerify: (...args: any[]) => mockJwtVerify(...args)
}));

let invalidateSpy: jest.SpyInstance;
let listByUser: jest.SpyInstance;
let listByEmailAsAdmin: jest.SpyInstance;
let getByCode: jest.SpyInstance;
let create: jest.SpyInstance;
let update: jest.SpyInstance;
let remove: jest.SpyInstance;

describe('api router', () => {
  let app: express.Express;
  

  beforeEach(async () => {
    setAppConfiguration(
      new TestAppConfiguration({
        keycloakIssuerUrl: 'http://kc.local/realms/test',
        adminBearerToken: 'admin',
        adminBearerTokenEnable: true,
        keycloakUserGroup: '',
        keycloakAdminGroup: ''
      })
    );
    mockJwtVerify.mockReset();
    app = express();
    app.use(express.json());
    const mod = await import('../src/routes/api.js');
    const redirect = await import('../src/routes/redirect.js');
    const services = await import('../src/services/shortUrl.service.js');
    invalidateSpy = jest.spyOn(redirect, 'invalidateCacheFor');
    listByUser = jest.spyOn(services.shortUrlService, 'listByUser');
    listByEmailAsAdmin = jest.spyOn(services.shortUrlService, 'listByEmailAsAdmin');
    getByCode = jest.spyOn(services.shortUrlService, 'getByCode');
    create = jest.spyOn(services.shortUrlService, 'create');
    update = jest.spyOn(services.shortUrlService, 'update');
    remove = jest.spyOn(services.shortUrlService, 'remove');
    app.use('/api', mod.default);
  });

  

  function authUser(): Record<string, string> {
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com' } });
    return { Authorization: 'Bearer userjwt' };
  }

  test('GET /api/url normal user lists own', async () => {
    listByUser.mockResolvedValue([{ code: 'a', label: 'L', longUrl: 'https://x', createdBy: 'user@example.com' } as any]);
    const res = await request(app).get('/api/url').set(authUser());
    expect(res.status).toBe(200);
    expect(listByUser).toHaveBeenCalledWith('user@example.com');
  });

  test('GET /api/url returns 500 on service error', async () => {
    listByUser.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/url').set(authUser());
    expect(res.status).toBe(500);
  });

  test('GET /api/url admin requires email', async () => {
    const res = await request(app).get('/api/url').set('Authorization', 'Bearer admin');
    expect(res.status).toBe(400);
  });

  test('GET /api/url admin with email', async () => {
    listByEmailAsAdmin.mockResolvedValue([{ code: 'x', label: 'L', longUrl: 'https://x', createdBy: 'a@b.c' } as any]);
    const res = await request(app).get('/api/url').query({ email: 'a@b.c' }).set('Authorization', 'Bearer admin');
    expect(res.status).toBe(200);
    expect(listByEmailAsAdmin).toHaveBeenCalledWith('a@b.c');
  });

  test('Group admin can list another user via email param', async () => {
    setAppConfiguration(new TestAppConfiguration({ keycloakIssuerUrl: 'http://kc.local/realms/test', keycloakAdminGroup: 'admins' }));
    const app2 = express();
    app2.use(express.json());
    const services = await import('../src/services/shortUrl.service.js');
    const listSpy = jest.spyOn(services.shortUrlService, 'listByEmailAsAdmin');
    listSpy.mockResolvedValue([{ code: 'x', label: 'L', longUrl: 'https://x', createdBy: 'a@b.c' } as any]);
    const mod = await import('../src/routes/api.js');
    app2.use('/api', mod.default);
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com', groups: ['/admins'] } });
    const res = await request(app2).get('/api/url').query({ email: 'a@b.c' }).set('Authorization', 'Bearer userjwt');
    expect(res.status).toBe(200);
    expect(listSpy).toHaveBeenCalledWith('a@b.c');
  });

  test('Group admin cannot override createdBy on POST', async () => {
    setAppConfiguration(new TestAppConfiguration({ keycloakIssuerUrl: 'http://kc.local/realms/test', keycloakAdminGroup: 'admins', adminBearerToken: 'admin', adminBearerTokenEnable: true }));
    const created = { code: 'C', label: 'L', longUrl: 'https://x', createdBy: 'user@example.com' } as any;
    create.mockImplementation(async (input: any) => {
      expect(input.createdBy).toBe('user@example.com');
      return created;
    });
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com', groups: ['admins'] } });
    const res = await request(app).post('/api/url').set('Authorization', 'Bearer userjwt').send({ label: 'L', longUrl: 'https://x', email: 'a@b.c' });
    expect(res.status).toBe(201);
  });

  test('GET /api/url/:code validation and ownership', async () => {
    let res = await request(app).get('/api/url/!bad').set(authUser());
    expect(res.status).toBe(400);

    getByCode.mockResolvedValue(null as any);
    res = await request(app).get('/api/url/ABC123').set(authUser());
    expect(res.status).toBe(404);

    getByCode.mockResolvedValue({ code: 'ABC123', createdBy: 'other@x.y' } as any);
    res = await request(app).get('/api/url/ABC123').set(authUser());
    expect(res.status).toBe(403);

    getByCode.mockResolvedValue({ code: 'ABC123', createdBy: 'user@example.com' } as any);
    res = await request(app).get('/api/url/ABC123').set(authUser());
    expect(res.status).toBe(200);

    // Admin can read any
    res = await request(app).get('/api/url/ABC123').set('Authorization', 'Bearer admin');
    expect(res.status).toBe(200);
  });

  test('POST /api/url validates payload and creates', async () => {
    let res = await request(app).post('/api/url').set(authUser()).send({});
    expect(res.status).toBe(400);

    res = await request(app).post('/api/url').set(authUser()).send({ label: 'L', longUrl: 'ftp://x' });
    expect(res.status).toBe(400);

    const created = { code: 'C', label: 'L', longUrl: 'https://x', createdBy: 'user@example.com' } as any;
    create.mockResolvedValue(created);
    res = await request(app).post('/api/url').set(authUser()).send({ label: 'L', longUrl: 'https://x' });
    expect(res.status).toBe(201);

    // Admin without email → createdBy system@local
    create.mockResolvedValue({ ...created, createdBy: 'system@local' });
    res = await request(app).post('/api/url').set('Authorization', 'Bearer admin').send({ label: 'L', longUrl: 'https://x' });
    expect(res.status).toBe(201);

    // Admin with email overrides createdBy
    create.mockResolvedValue({ ...created, createdBy: 'a@b.c' });
    res = await request(app).post('/api/url').set('Authorization', 'Bearer admin').send({ label: 'L', longUrl: 'https://x', email: 'a@b.c' });
    expect(res.status).toBe(201);
  });

  test('POST /api/url invalid expiresAt', async () => {
    const res = await request(app).post('/api/url').set(authUser()).send({ label: 'L', longUrl: 'https://x', expiresAt: 'bad-date' });
    expect(res.status).toBe(400);
  });

  test('POST /api/url conflict and server error', async () => {
    create.mockRejectedValueOnce(new Error('could not generate unique code'));
    let res = await request(app).post('/api/url').set(authUser()).send({ label: 'L', longUrl: 'https://x' });
    expect(res.status).toBe(409);
    create.mockRejectedValueOnce(new Error('other'));
    res = await request(app).post('/api/url').set(authUser()).send({ label: 'L', longUrl: 'https://x' });
    expect(res.status).toBe(500);
    // no message branch
    create.mockRejectedValueOnce(new Error(''));
    res = await request(app).post('/api/url').set(authUser()).send({ label: 'L', longUrl: 'https://x' });
    expect(res.status).toBe(500);
  });

  test('PUT /api/url validates and updates', async () => {
    let res = await request(app).put('/api/url').set(authUser()).send({ code: '' });
    expect(res.status).toBe(400);

    res = await request(app).put('/api/url').set(authUser()).send({ code: 'ABC123', longUrl: 'ftp://x' });
    expect(res.status).toBe(400);

    update.mockResolvedValue(null as any);
    res = await request(app).put('/api/url').set(authUser()).send({ code: 'ABC123', label: 'L' });
    expect(res.status).toBe(404);

    update.mockRejectedValue(new Error('forbidden'));
    res = await request(app).put('/api/url').set(authUser()).send({ code: 'ABC123', label: 'L' });
    expect(res.status).toBe(403);

    update.mockRejectedValue(new Error('invalid longUrl'));
    res = await request(app).put('/api/url').set(authUser()).send({ code: 'ABC123', longUrl: 'http://x' });
    expect(res.status).toBe(400);

    update.mockResolvedValue({ code: 'ABC123', label: 'L' } as any);
    res = await request(app).put('/api/url').set(authUser()).send({ code: 'ABC123', label: 'L' });
    expect(res.status).toBe(200);
    expect(invalidateSpy).toHaveBeenCalledWith('ABC123');
  });

  test('PUT /api/url invalid expiresAt and server error', async () => {
    let res = await request(app).put('/api/url').set(authUser()).send({ code: 'ABC123', expiresAt: 'bad-date' });
    expect(res.status).toBe(400);
    update.mockRejectedValueOnce(new Error('boom'));
    res = await request(app).put('/api/url').set(authUser()).send({ code: 'ABC123' });
    expect(res.status).toBe(500);
    update.mockRejectedValueOnce(new Error(''));
    res = await request(app).put('/api/url').set(authUser()).send({ code: 'ABC123' });
    expect(res.status).toBe(500);
  });

  test('PUT /api/url as admin sets updatedBy admin', async () => {
    update.mockResolvedValue({ code: 'ZZZ999', label: 'L' } as any);
    const res = await request(app).put('/api/url').set('Authorization', 'Bearer admin').send({ code: 'ZZZ999', label: 'L' });
    expect(res.status).toBe(200);
  });

  test('PUT /api/url with expiresAt provided', async () => {
    update.mockResolvedValue({ code: 'ABC999', expiresAt: new Date().toISOString() } as any);
    const res = await request(app)
      .put('/api/url')
      .set(authUser())
      .send({ code: 'ABC999', expiresAt: new Date().toISOString() });
    expect(res.status).toBe(200);
  });

  test('DELETE /api/url validates and deletes', async () => {
    let res = await request(app).delete('/api/url').set(authUser()).send({ code: '' });
    expect(res.status).toBe(400);

    remove.mockResolvedValue(false);
    res = await request(app).delete('/api/url').set(authUser()).send({ code: 'ABC123' });
    expect(res.status).toBe(404);

    remove.mockResolvedValue(true);
    res = await request(app).delete('/api/url').set(authUser()).send({ code: 'ABC123' });
    expect(res.status).toBe(204);
    expect(invalidateSpy).toHaveBeenCalledWith('ABC123');
  });

  test('DELETE /api/url forbidden and server error', async () => {
    remove.mockRejectedValueOnce(new Error('forbidden'));
    let res = await request(app).delete('/api/url').set(authUser()).send({ code: 'ABC123' });
    expect(res.status).toBe(403);
    remove.mockRejectedValueOnce(new Error('boom'));
    res = await request(app).delete('/api/url').set(authUser()).send({ code: 'ABC123' });
    expect(res.status).toBe(500);
  });
});
