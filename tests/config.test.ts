import { AppConfiguration, TestAppConfiguration, getAppConfiguration, setAppConfiguration } from '../src/config/appConfig.js';

describe('AppConfiguration and TestAppConfiguration', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    setAppConfiguration(new AppConfiguration());
    process.env = OLD_ENV;
  });

  test('AppConfiguration reads from process.env dynamically', () => {
    process.env.ADMIN_BEARER_TOKEN = 'secret';
    process.env.ADMIN_BEARER_TOKEN_ENABLE = 'true';
    process.env.KEYCLOAK_ISSUER_URL = 'http://kc/realms/test';
    process.env.KEYCLOAK_AUDIENCE = 'api';
    process.env.KEYCLOAK_ENFORCE_AUDIENCE = 'true';
    process.env.KEYCLOAK_USER_GROUP = ' users ';
    process.env.KEYCLOAK_ADMIN_GROUP = '/admins';

    const cfg = new AppConfiguration();
    expect(cfg.adminBearerToken).toBe('secret');
    expect(cfg.adminBearerTokenEnable).toBe(true);
    expect(cfg.keycloakIssuerUrl).toBe('http://kc/realms/test');
    expect(cfg.keycloakAudience).toBe('api');
    expect(cfg.keycloakEnforceAudience).toBe(true);
    expect(cfg.keycloakUserGroup).toBe('users');
    expect(cfg.keycloakAdminGroup).toBe('/admins');
  });

  test('TestAppConfiguration supports overrides via constructor', () => {
    const testCfg = new TestAppConfiguration({
      adminBearerToken: 'a',
      adminBearerTokenEnable: true,
      keycloakIssuerUrl: 'issuer',
      keycloakAudience: 'aud',
      keycloakEnforceAudience: true,
      keycloakUserGroup: 'g',
      keycloakAdminGroup: 'ga'
    });
    expect(testCfg.adminBearerToken).toBe('a');
    expect(testCfg.adminBearerTokenEnable).toBe(true);
    expect(testCfg.keycloakIssuerUrl).toBe('issuer');
    expect(testCfg.keycloakAudience).toBe('aud');
    expect(testCfg.keycloakEnforceAudience).toBe(true);
    expect(testCfg.keycloakUserGroup).toBe('g');
    expect(testCfg.keycloakAdminGroup).toBe('ga');
  });

  test('AppConfiguration defaults when env is missing', () => {
    delete process.env.ADMIN_BEARER_TOKEN;
    delete process.env.ADMIN_BEARER_TOKEN_ENABLE;
    delete process.env.KEYCLOAK_ISSUER_URL;
    delete process.env.KEYCLOAK_AUDIENCE;
    delete process.env.KEYCLOAK_CLIENT_ID;
    delete process.env.KEYCLOAK_ENFORCE_AUDIENCE;
    delete process.env.KEYCLOAK_USER_GROUP;
    delete process.env.KEYCLOAK_ADMIN_GROUP;

    const cfg = new AppConfiguration();
    expect(cfg.adminBearerToken).toBeUndefined();
    expect(cfg.adminBearerTokenEnable).toBe(false);
    expect(cfg.keycloakIssuerUrl).toBeUndefined();
    expect(cfg.keycloakAudience).toBeUndefined();
    expect(cfg.keycloakClientId).toBeUndefined();
    expect(cfg.keycloakEnforceAudience).toBe(false);
    expect(cfg.keycloakUserGroup).toBe('');
    expect(cfg.keycloakAdminGroup).toBe('');
  });

  test('setAppConfiguration and getAppConfiguration', () => {
    const testCfg = new TestAppConfiguration({ keycloakIssuerUrl: 'x' });
    setAppConfiguration(testCfg);
    expect(getAppConfiguration()).toBe(testCfg);
  });
});
