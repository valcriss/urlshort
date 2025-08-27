import request from 'supertest';

describe('server endpoints', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.NODE_ENV = 'test';
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('health and backend', async () => {
    let app: any;
    try {
      ({ default: app } = await import('../src/server.js'));
    } catch (e: any) {
      // Help debug import failures
      console.error('Import server error', e);
      throw e;
    }
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');

    const r2 = await request(app).get('/backend');
    expect(r2.status).toBe(200);
  });

  test('backend config parses realm', async () => {
    process.env.KEYCLOAK_ISSUER_URL = 'http://host:8080/realms/myrealm';
    process.env.KEYCLOAK_CLIENT_ID = 'clientX';
    const { default: app } = await import('../src/server.js');
    const res = await request(app).get('/backend/config.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('myrealm');
    expect(res.text).toContain('clientX');
  });

  test('keycloak adapter proxy success and errors', async () => {
    process.env.KEYCLOAK_ISSUER_URL = 'http://host:8080/realms/myrealm';
    // Mock global fetch
    const g: any = global;
    const originalFetch = g.fetch;
    g.fetch = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('adapter') });
    const { default: app } = await import('../src/server.js');
    let res = await request(app).get('/backend/keycloak.js');
    expect(res.status).toBe(200);
    expect(res.text).toBe('adapter');

    // Upstream not ok
    g.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('') });
    res = await request(app).get('/backend/keycloak.js');
    expect(res.status).toBe(502);

    // Throwing path
    process.env.KEYCLOAK_ISSUER_URL = '::bad::';
    res = await request(app).get('/backend/keycloak.js');
    expect(res.status).toBe(500);
    // restore
    g.fetch = originalFetch;
  });
});
