export interface IAppConfiguration {
  adminBearerToken?: string;
  adminBearerTokenEnable: boolean;
  keycloakIssuerUrl?: string;
  keycloakAudience?: string;
  keycloakEnforceAudience: boolean;
  keycloakUserGroup: string;
  keycloakAdminGroup: string;
}

export class AppConfiguration implements IAppConfiguration {
  get adminBearerToken(): string | undefined {
    return process.env.ADMIN_BEARER_TOKEN;
  }
  get adminBearerTokenEnable(): boolean {
    return process.env.ADMIN_BEARER_TOKEN_ENABLE === 'true';
  }
  get keycloakIssuerUrl(): string | undefined {
    return process.env.KEYCLOAK_ISSUER_URL;
  }
  get keycloakAudience(): string | undefined {
    return process.env.KEYCLOAK_AUDIENCE;
  }
  get keycloakEnforceAudience(): boolean {
    return process.env.KEYCLOAK_ENFORCE_AUDIENCE === 'true';
  }
  get keycloakUserGroup(): string {
    return (process.env.KEYCLOAK_USER_GROUP || '').trim();
  }
  get keycloakAdminGroup(): string {
    return (process.env.KEYCLOAK_ADMIN_GROUP || '').trim();
  }
}

export class TestAppConfiguration implements IAppConfiguration {
  constructor(init?: Partial<IAppConfiguration>) {
    if (init) Object.assign(this, init);
  }
  adminBearerToken?: string;
  adminBearerTokenEnable: boolean = false;
  keycloakIssuerUrl?: string;
  keycloakAudience?: string;
  keycloakEnforceAudience: boolean = false;
  keycloakUserGroup: string = '';
  keycloakAdminGroup: string = '';
}

let currentConfig: IAppConfiguration = new AppConfiguration();

export function getAppConfiguration(): IAppConfiguration {
  return currentConfig;
}

export function setAppConfiguration(cfg: IAppConfiguration): void {
  currentConfig = cfg;
}

