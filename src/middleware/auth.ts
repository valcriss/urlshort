import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const ADMIN_BEARER_TOKEN = process.env.ADMIN_BEARER_TOKEN;
const KEYCLOAK_ISSUER_URL = process.env.KEYCLOAK_ISSUER_URL; // e.g., https://keycloak.example.com/realms/<realm>
const KEYCLOAK_AUDIENCE = process.env.KEYCLOAK_AUDIENCE; // optional, can be enforced via KEYCLOAK_ENFORCE_AUDIENCE
const KEYCLOAK_ENFORCE_AUDIENCE = process.env.KEYCLOAK_ENFORCE_AUDIENCE === 'true';

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
export function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!KEYCLOAK_ISSUER_URL) {
    throw new Error('KEYCLOAK_ISSUER_URL not configured');
  }
  if (!jwks) {
    const jwksUrl = new URL(KEYCLOAK_ISSUER_URL.replace(/\/$/, '') + '/protocol/openid-connect/certs');
    jwks = createRemoteJWKSet(jwksUrl);
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

    if (ADMIN_BEARER_TOKEN && token === ADMIN_BEARER_TOKEN) {
      req.isAdmin = true;
      req.userEmail = undefined; // will be provided per request when creating as admin
      return next();
    }

    if (!KEYCLOAK_ISSUER_URL) {
      res.status(500).json({ error: 'OIDC not configured' });
      return;
    }

    const { payload } = await jwtVerify(token, getJwks(), {
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

    req.isAdmin = false;
    req.userEmail = email;
    return next();
  } catch (err) {
    console.error('Auth error', err);
    res.status(401).json({ error: 'Invalid token' });
  }
}
