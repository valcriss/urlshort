# UrlShort — Self‑Hosted URL Shortener

UrlShort is a secure, extensible, self‑hosted URL shortener. It provides a public redirection endpoint, a Keycloak‑protected admin UI, and a JSON REST API. Every short URL is owned by its creator (Keycloak email), and click statistics are captured on each successful redirect.

- Public redirect: `GET /:code` (302 to long URL; 404/410 on unknown/expired)
- REST API: `GET/POST/PUT/DELETE /api/url` (+ `GET /api/url/:code`), protected by Keycloak or an Admin bearer token
- Admin UI: `GET /backend` (Keycloak‑protected UI to list/create/update/delete)

## Tech Stack
- Node.js 20+ (CI/Docker use Node 24)
- TypeScript + Express
- Prisma (PostgreSQL 14+)
- Auth: Keycloak (OIDC/JWT) or Admin token
- Tests: Jest (100% thresholds), ESLint, Husky pre‑commit
- Logging: Pino/Pino‑HTTP, Helmet for security headers

## Data Model (Prisma)
ShortUrl
- code (id, varchar[32])
- label (varchar[120])
- longUrl (text, http/https only)
- expiresAt (timestamptz, nullable)
- createdBy, updatedBy (text, usually Keycloak email)
- createdAt (now), updatedAt (updatedAt)
- clickCount (int, default 0), lastAccessAt (timestamptz, nullable)

Indexes: expiresAt, lastAccessAt

## Endpoints
- Redirection
  - `GET /:code` → 302 to long URL, headers `Cache-Control: no-store`, `X-Robots-Tag: noindex`
  - 404 when not found, 410 Gone when expired
  - On successful redirect: `clickCount++`, `lastAccessAt = now()` (atomic DB update)
- REST API (all return JSON)
  - `GET /api/url` → list URLs created by caller; with Admin token you can pass `?email=user@example.com`
  - `GET /api/url/:code` → details if caller owns it; Admin token can access any
  - `POST /api/url` → create (server‑generated code). With Admin token, optional `email` sets `createdBy`; otherwise defaults to `system@local`
  - `PUT /api/url` → update by code (label/longUrl/expiresAt)
  - `DELETE /api/url` → delete by code

## Authentication
- Keycloak OIDC (JWT) — JWKS fetched from issuer; required claim: `email` (or `preferred_username`/`sub` fallback). Optional audience enforcement.
- Admin Bearer Token — bypass Keycloak with `Authorization: Bearer <ADMIN_BEARER_TOKEN>`.

## Environment Variables
Required/Recommended
- `DATABASE_URL` — PostgreSQL connection string (Prisma)
- `PORT` — HTTP port (default 3000)
- `REDIRECT_CACHE_MAX` — LRU cache size for redirects (default 2000)

Keycloak
- `KEYCLOAK_ISSUER_URL` — e.g. `https://keycloak.example.com/realms/<realm>`
- `KEYCLOAK_AUDIENCE` — expected audience (optional)
- `KEYCLOAK_ENFORCE_AUDIENCE` — `true|false` (default false)
- `KEYCLOAK_USER_GROUP` — required group name for access (optional)
- `KEYCLOAK_ADMIN_GROUP` — group name with admin privileges (optional)
- `KEYCLOAK_CLIENT_ID` — client ID for the admin UI (exposed in `/backend/config.js`)

Admin Token
- `ADMIN_BEARER_TOKEN` — long, random secret used as Bearer token for admin bypass
- `ADMIN_BEARER_TOKEN_ENABLE` — `true|false` to enable bypass

Misc
- `NODE_ENV` — `production|development|test`

See `.env.example` for a curated list.

## Configuration & Testing Strategy
- App configuration is centralized via `AppConfiguration` (reads env) and `TestAppConfiguration` (overridable). Code reads config at runtime — no env is captured at module load.
- Prisma client is resolved lazily via `getPrisma()` so tests can swap environments deterministically.

## Local Development
1) Install deps
- `npm ci`

2) Database
- Start Postgres (see `docker-compose.yml`) and set `DATABASE_URL` in `.env`
- Generate Prisma client: `npm run prisma:generate`
- Apply migrations (dev): `npm run prisma:migrate`

3) Run
- Dev: `npm run dev` (tsx + watch)
- Build: `npm run build`
- Start (prod): `npm start`

4) Tests & Lint
- Unit/integration: `npm test` (100% coverage enforced)
- Lint: `npm run lint` (no warnings/errors)

## Docker
Build & Run
- Build: `docker build -t urlshort:local .`
- Run: `docker run --rm -p 3000:3000 --env-file .env urlshort:local`

Notes
- The image builds Prisma client and prunes dev deps. Run migrations separately before first start:
  - `docker run --rm --env-file .env urlshort:local npx prisma migrate deploy`
- See `docker-compose.yml` for a multi‑service setup (app + Postgres).

## Keycloak Integration
- Set `KEYCLOAK_ISSUER_URL` to your realm issuer URL — JWKS is discovered at `.../protocol/openid-connect/certs`.
- Optionally enforce `KEYCLOAK_AUDIENCE` by setting `KEYCLOAK_ENFORCE_AUDIENCE=true`.
- Use `KEYCLOAK_USER_GROUP` and/or `KEYCLOAK_ADMIN_GROUP` to gate access.

## Admin Token (Bypass)
- When enabled, requests with `Authorization: Bearer <ADMIN_BEARER_TOKEN>` are treated as admin.
- Extra capabilities:
  - `GET /api/url?email=user@example.com` lists URLs for specified user
  - `POST /api/url` accepts `email` to set `createdBy` (defaults to `system@local`)
- Security: never expose the token to browsers; store as a secret; rotate regularly.

## Admin UI
- Served at `/backend` and protected by Keycloak.
- Reads configuration from `/backend/config.js` (issuer base URL, realm, clientId, group names).
- Basic table with actions: Add/Edit/Delete, Copy link; audit fields: createdBy/At, updatedBy/At; stats: clickCount/lastAccessAt.

## Deployment Checklist
- Provision PostgreSQL and set `DATABASE_URL`.
- Configure Keycloak client (confidential/public as needed) and set `KEYCLOAK_*` envs.
- Generate Prisma client & run migrations (`prisma migrate deploy`).
- Set `ADMIN_BEARER_TOKEN` (long random) and enable if needed.
- Put the app behind TLS and a reverse proxy (NGINX, Traefik, etc.).
- Harden runtime: set `NODE_ENV=production`.

## Health & Ops
- `GET /health` → `{ status: 'ok' }`
- Structured logs via Pino; Helmet enabled for sensible security headers.

## CI
- GitHub Actions: Node 24, ESLint, Jest with coverage. CI uses Istanbul coverage for stability (`JEST_COVERAGE=babel`), local uses V8.

## License
- See project root for license details (if any).

