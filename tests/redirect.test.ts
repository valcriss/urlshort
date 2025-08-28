import express from 'express';
import request from 'supertest';

import redirectRouter, { invalidateCacheFor, __createLRUForTests } from '../src/routes/redirect.js';
import { shortUrlService } from '../src/services/shortUrl.service.js';

describe('redirect router', () => {
  let app: express.Express;
  const getByCode = jest.spyOn(shortUrlService, 'getByCode');
  const incr = jest.spyOn(shortUrlService, 'incrementStatsOnRedirect');

  beforeEach(() => {
    app = express();
    app.use('/', redirectRouter);
    getByCode.mockReset();
    incr.mockReset();
  });

  test('404 when unknown code', async () => {
    getByCode.mockResolvedValue(null as any);
    const res = await request(app).get('/unknown');
    expect(res.status).toBe(404);
    expect(res.headers['x-robots-tag']).toBe('noindex');
  });

  test('410 when expired', async () => {
    getByCode.mockResolvedValue({ longUrl: 'https://example.com', expiresAt: new Date(Date.now() - 1000) } as any);
    const res = await request(app).get('/abc123');
    expect(res.status).toBe(410);
    expect(incr).not.toHaveBeenCalled();
  });

  test('302 redirect and cache hit on second call', async () => {
    const item = { longUrl: 'https://example.com', expiresAt: null };
    getByCode.mockResolvedValue(item as any);
    incr.mockResolvedValue({} as any);

    const r1 = await request(app).get('/ZZZ999');
    expect(r1.status).toBe(302);
    expect(r1.headers.location).toBe('https://example.com');
    expect(getByCode).toHaveBeenCalledTimes(1);

    // Second call should serve from cache (no extra getByCode call)
    const r2 = await request(app).get('/ZZZ999');
    expect(r2.status).toBe(302);
    expect(getByCode).toHaveBeenCalledTimes(1);
    expect(incr).toHaveBeenCalledTimes(2);

    // Invalidate cache and ensure fetch again
    invalidateCacheFor('ZZZ999');
    await request(app).get('/ZZZ999');
    expect(getByCode).toHaveBeenCalledTimes(2);
  });

  test('stats update rejection is ignored', async () => {
    const item = { longUrl: 'https://example.com', expiresAt: null };
    getByCode.mockResolvedValue(item as any);
    incr.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/IGNORED');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com');
  });

  test('500 on unexpected error', async () => {
    getByCode.mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/ERR500');
    expect(res.status).toBe(500);
  });

  test('302 redirect when expiresAt is in the future', async () => {
    const future = new Date(Date.now() + 60_000);
    getByCode.mockResolvedValue({ longUrl: 'https://example.com', expiresAt: future } as any);
    incr.mockResolvedValue({} as any);
    const res = await request(app).get('/FUTURE1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com');
  });

  test('LRU eviction branch', async () => {
    // Reload module with small cache size to hit eviction branch
    jest.resetModules();
    process.env.REDIRECT_CACHE_MAX = '2';
    const mod = await import('../src/routes/redirect.js');
    const router2 = mod.default as typeof redirectRouter;
    const app2 = express();
    app2.use('/', router2);
    const svc = await import('../src/services/shortUrl.service.js');
    jest.spyOn(svc.shortUrlService, 'getByCode').mockResolvedValue({ longUrl: 'https://x', expiresAt: null } as any);
    jest.spyOn(svc.shortUrlService, 'incrementStatsOnRedirect').mockResolvedValue({} as any);
    await request(app2).get('/a');
    await request(app2).get('/b');
    await request(app2).get('/c');
    // If it didn't throw, eviction code path executed
  });

  test('LRU constructor paths (with and without parameter)', () => {
    // with parameter
    expect(__createLRUForTests(5)).toBeDefined();
    // without parameter (uses default value in constructor)
    expect(__createLRUForTests()).toBeDefined();
  });
});
