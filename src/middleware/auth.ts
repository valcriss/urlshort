import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { getAppConfiguration } from '../config/appConfig.js';

// Cache JWKS per issuer to support dynamic env in tests and multiple realms
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function getJwks(issuerUrlParam?: string): ReturnType<typeof createRemoteJWKSet> {
  const issuerUrl = (issuerUrlParam ?? process.env.KEYCLOAK_ISSUER_URL) as string | undefined;
  if (!issuerUrl) {
    throw new Error('KEYCLOAK_ISSUER_URL not configured');
  }
  const base = issuerUrl.replace(/\/$/, '');
  let jwks = jwksCache.get(base);
  if (!jwks) {
    const jwksUrl = new URL(base + '/protocol/openid-connect/certs');
    jwks = createRemoteJWKSet(jwksUrl);
    jwksCache.set(base, jwks);
  }
  return jwks;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = req.header('authorization') || req.header('Authorization');

    if (!auth || !auth.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Bearer token' });
      return;
    }

    const token = auth.slice('Bearer '.length).trim();

    // Use centralized configuration
    const cfg = getAppConfiguration();
    const ADMIN_BEARER_TOKEN = cfg.adminBearerToken;
    const ADMIN_BEARER_TOKEN_ENABLE = cfg.adminBearerTokenEnable;
    const KEYCLOAK_ISSUER_URL = cfg.keycloakIssuerUrl; // e.g., https://keycloak.example.com/realms/<realm>
    const KEYCLOAK_AUDIENCE = cfg.keycloakAudience; // optional, can be enforced via KEYCLOAK_ENFORCE_AUDIENCE
    const KEYCLOAK_ENFORCE_AUDIENCE = cfg.keycloakEnforceAudience;

    if (ADMIN_BEARER_TOKEN_ENABLE && ADMIN_BEARER_TOKEN && token === ADMIN_BEARER_TOKEN) {
      req.isAdmin = true;
      req.adminToken = true; // elevated admin via secret token
      req.userEmail = undefined; // will be provided per request when creating as admin
      return next();
    }

    if (!KEYCLOAK_ISSUER_URL) {
      res.status(500).json({ error: 'OIDC not configured' });
      return;
    }

    const { payload } = await jwtVerify(token, getJwks(KEYCLOAK_ISSUER_URL), {
      issuer: KEYCLOAK_ISSUER_URL,
      // Do not pass audience here to keep dev flexible; optionally enforce below
    });

    if (KEYCLOAK_ENFORCE_AUDIENCE && KEYCLOAK_AUDIENCE) {
      const aud = payload.aud;
      const audOk = Array.isArray(aud) ? aud.includes(KEYCLOAK_AUDIENCE) : aud === KEYCLOAK_AUDIENCE;
      if (!audOk) {
        res.status(401).json({ error: 'Invalid audience' });
        return;
      }
    }

    // email claim is required
    const email = (payload.email || payload.preferred_username || payload.sub) as string | undefined;
    if (!email) {
      res.status(403).json({ error: 'Email claim required' });
      return;
    }

    // Groups check
    const groups = Array.isArray((payload as any).groups) ? ((payload as any).groups as string[]) : [];
    const KEYCLOAK_USER_GROUP = getAppConfiguration().keycloakUserGroup;
    const KEYCLOAK_ADMIN_GROUP = getAppConfiguration().keycloakAdminGroup;
    const normalize = (g: string): string => g.replace(/^\//, '');
    const hasGroup = (want: string): boolean => groups.some((g) => normalize(g) === normalize(want));

    if (KEYCLOAK_USER_GROUP && !hasGroup(KEYCLOAK_USER_GROUP)) {
      res.status(403).json({ error: 'User not in required group' });
      return;
    }

    const isAdminGroup = KEYCLOAK_ADMIN_GROUP ? hasGroup(KEYCLOAK_ADMIN_GROUP) : false;

    req.isAdmin = isAdminGroup;
    req.userEmail = email;
    return next();
  } catch (err) {
    console.error('Auth error', err);
    res.status(401).json({ error: 'Invalid token' });
  }
}
