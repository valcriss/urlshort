import express from 'express';
import request from 'supertest';

import { setAppConfiguration, TestAppConfiguration } from '../src/config/appConfig.js';

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
  beforeEach(() => {
    setAppConfiguration(
      new TestAppConfiguration({
        keycloakIssuerUrl: 'http://kc.local/realms/test',
        keycloakEnforceAudience: false,
        adminBearerTokenEnable: false,
        keycloakUserGroup: '',
        keycloakAdminGroup: ''
      })
    );
    mockJwtVerify.mockReset();
    mockCreateJWKS.mockReset();
  });
  

  test('required user group denies access when missing', async () => {
    setAppConfiguration(new TestAppConfiguration({ keycloakIssuerUrl: 'http://kc.local/realms/test', keycloakUserGroup: 'users' }));
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com', groups: ['/other'] } });
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer jwt');
    expect(res.status).toBe(403);
  });

  test('required user group allows access when present', async () => {
    setAppConfiguration(new TestAppConfiguration({ keycloakIssuerUrl: 'http://kc.local/realms/test', keycloakUserGroup: 'users' }));
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com', groups: ['/users'] } });
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer jwt');
    expect(res.status).toBe(200);
  });

  test('admin group sets isAdmin', async () => {
    setAppConfiguration(new TestAppConfiguration({ keycloakIssuerUrl: 'http://kc.local/realms/test', keycloakAdminGroup: 'admins' }));
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com', groups: ['admins'] } });
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer jwt');
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(true);
  });

  test('getJwks throws when not configured', async () => {
    setAppConfiguration(new TestAppConfiguration({ keycloakIssuerUrl: undefined }));
    const mod = await import('../src/middleware/auth.js');
    expect(() => mod.getJwks()).toThrow('KEYCLOAK_ISSUER_URL not configured');
  });

  test('rejects when missing bearer', async () => {
    const app = await buildApp();
    const res = await request(app).get('/t');
    expect(res.status).toBe(401);
  });

  test('admin token bypass', async () => {
    setAppConfiguration(new TestAppConfiguration({ adminBearerToken: 'secret-admin', adminBearerTokenEnable: true, keycloakIssuerUrl: 'http://kc.local/realms/test' }));
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer secret-admin');
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(true);
  });

  test('oidc not configured', async () => {
    setAppConfiguration(new TestAppConfiguration({ keycloakIssuerUrl: undefined }));
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
    setAppConfiguration(new TestAppConfiguration({ keycloakIssuerUrl: 'http://kc.local/realms/test', keycloakEnforceAudience: true, keycloakAudience: 'api' }));
    mockJwtVerify.mockResolvedValue({ payload: { email: 'user@example.com', aud: 'wrong' } });
    const app = await buildApp();
    const res = await request(app).get('/t').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(401);
  });

  test('valid audience when aud is array', async () => {
    setAppConfiguration(new TestAppConfiguration({ keycloakIssuerUrl: 'http://kc.local/realms/test', keycloakEnforceAudience: true, keycloakAudience: 'api' }));
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
