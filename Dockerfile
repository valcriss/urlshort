# Multi-stage production Dockerfile for urlshort (Node.js 20 + Prisma)

FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy sources
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY public ./public

# Generate Prisma client and build TypeScript
RUN npx prisma generate
RUN npm run build

# Remove dev dependencies for production
RUN npm prune --omit=dev


FROM node:20.19.4-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Install minimal runtime deps (libssl for Prisma, tini for proper signal handling)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libssl3 tini \
  && rm -rf /var/lib/apt/lists/*

# Copy production node_modules and build artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY public ./public
COPY package*.json ./

EXPOSE 3000
USER node
CMD ["tini", "--", "node", "dist/server.js"]

