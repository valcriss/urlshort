import express from 'express';
import request from 'supertest';

// Mock jose to control jwtVerify behavior
const mockJwtVerify = jest.fn();
const mockCreateJWKS = jest.fn(() => ({} as any));
jest.mock('jose', () => ({
  createRemoteJWKSet: () => mockCreateJWKS(),
  jwtVerify: (...args: any[]) => mockJwtVerify(...args)
}));

// Helper to build an app using the real middleware
async function buildApp(): Promise<express.Express> {
  const { authMiddleware } = await import('../src/middleware/auth.js');
  const app = express();
  app.get('/t', authMiddleware, (req, res) => {
    res.json({ email: (req as any).userEmail ?? null, isAdmin: (req as any).isAdmin ?? false });
  });
  return app;
}

describe('auth middleware', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    delete process.env.ADMIN_BEARER_TOKEN;
    process.env.KEYCLOAK_ISSUER_URL = 'http://kc.local/realms/test';
    process.env.KEYCLOAK_ENFORCE_AUDIENCE = 'false';
    mockJwtVerify.mockReset();
    mockCreateJWKS.mockReset();
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('required user group denies access when missing', async () => {
    process.env.KEYCLOAK_USER_GROUP = 'users';
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com', groups: ['/other'] } });
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer jwt');
    expect(res.status).toBe(403);
  });

  test('required user group allows access when present', async () => {
    process.env.KEYCLOAK_USER_GROUP = 'users';
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com', groups: ['/users'] } });
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer jwt');
    expect(res.status).toBe(200);
  });

  test('admin group sets isAdmin', async () => {
    process.env.KEYCLOAK_ADMIN_GROUP = 'admins';
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com', groups: ['admins'] } });
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer jwt');
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(true);
  });

  test('getJwks throws when not configured', async () => {
    jest.resetModules();
    delete process.env.KEYCLOAK_ISSUER_URL;
    const mod = await import('../src/middleware/auth.js');
    expect(() => mod.getJwks()).toThrow('KEYCLOAK_ISSUER_URL not configured');
  });

  test('rejects when missing bearer', async () => {
    const app = await buildApp();
    const res = await request(app).get('/t');
    expect(res.status).toBe(401);
  });

  test('admin token bypass', async () => {
    process.env.ADMIN_BEARER_TOKEN = 'secret-admin';
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer secret-admin');
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(true);
  });

  test('oidc not configured', async () => {
    delete process.env.KEYCLOAK_ISSUER_URL;
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer x');
    expect(res.status).toBe(500);
  });

  test('valid jwt sets email', async () => {
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com' } });
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('user@example.com');
  });

  test('invalid audience when enforced', async () => {
    process.env.KEYCLOAK_ENFORCE_AUDIENCE = 'true';
    process.env.KEYCLOAK_AUDIENCE = 'api';
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com', aud: 'wrong' } });
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(401);
  });

  test('valid audience when aud is array', async () => {
    process.env.KEYCLOAK_ENFORCE_AUDIENCE = 'true';
    process.env.KEYCLOAK_AUDIENCE = 'api';
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com', aud: ['x', 'api'] } });
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(200);
  });

  test('missing email claim', async () => {
    mockJwtVerify.mockResolvedValue({ payload: {} });
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(403);
  });

  test('invalid token', async () => {
    mockJwtVerify.mockRejectedValue(new Error('bad'));
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(401);
  });
});
