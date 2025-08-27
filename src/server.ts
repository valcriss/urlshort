import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import pinoHttp from 'pino-http';

import apiRouter from './routes/api.js';
import redirectRouter from './routes/redirect.js';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Compute Keycloak origin for CSP connect-src
function getKeycloakOrigin(): string | undefined {
  try {
    const issuer = process.env.KEYCLOAK_ISSUER_URL || '';
    if (!issuer) return undefined;
    const u = new URL(issuer);
    return u.origin;
  } catch {
    return undefined;
  }
}

const logger = pinoHttp({
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' }
});

app.use(logger);

// Configure Helmet: relax for dev to avoid HTTPS-only/COOP warnings and allow Keycloak connect-src
const keycloakOrigin = getKeycloakOrigin();
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", ...(keycloakOrigin ? [keycloakOrigin] : [])],
        // Do NOT include 'upgrade-insecure-requests' in dev to avoid HTTPS upgrade
      }
    },
    crossOriginOpenerPolicy: isProd ? undefined : false,
    originAgentCluster: isProd ? undefined : false,
    hsts: isProd ? undefined : false
  })
);
app.use(express.json());

// Static assets (serves /public under root)
const publicDir = path.resolve(process.cwd(), 'public');
app.use(express.static(publicDir, { redirect: false }));

// Healthcheck
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Admin UI config: emits JS from env to be used by the frontend
app.get('/backend/config.js', (_req, res) => {
  const issuer = process.env.KEYCLOAK_ISSUER_URL || '';
  let baseUrl = '';
  let realm = '';
  try {
    const u = new URL(issuer);
    // issuer expected like http://host:8080/realms/<realm>
    const parts = u.pathname.split('/').filter(Boolean);
    const realmIdx = parts.findIndex((p) => p === 'realms');
    if (realmIdx >= 0 && parts[realmIdx + 1]) {
      realm = parts[realmIdx + 1];
    }
    u.pathname = '/';
    baseUrl = u.toString().replace(/\/$/, '');
  } catch {
    baseUrl = '';
    realm = '';
  }
  const clientId = process.env.KEYCLOAK_CLIENT_ID || process.env.KEYCLOAK_AUDIENCE || 'urlshort';
  const cfg = {
    url: baseUrl,
    realm,
    clientId,
  };
  res.type('application/javascript').send(`window.KEYCLOAK_CONFIG = ${JSON.stringify(cfg)};\n`);
});

// Proxy Keycloak adapter as same-origin to satisfy CSP
app.get('/backend/keycloak.js', async (_req, res) => {
  try {
    const issuer = process.env.KEYCLOAK_ISSUER_URL || '';
    const u = new URL(issuer);
    u.pathname = '/js/keycloak.js';
    const upstream = u.toString();
    const r = await fetch(upstream);
    if (!r.ok) {
      res.status(502).type('text/plain').send(`Failed to fetch keycloak.js: ${r.status}`);
      return;
    }
    res.setHeader('Content-Type', 'application/javascript');
    const text = await r.text();
    res.send(text);
  } catch {
    res.status(500).type('text/plain').send('Keycloak adapter error');
  }
});

// Admin UI (static SPA)
app.get('/backend', (_req, res) => {
  res.sendFile(path.join(publicDir, 'backend', 'index.html'));
});

// API routes (with auth inside)
app.use('/api', apiRouter);

// Root path → backend UI
app.get('/', (_req, res) => res.redirect(302, '/backend'));

// Redirect route last
app.use('/', redirectRouter);

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

export default app;
