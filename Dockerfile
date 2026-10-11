# syntax=docker/dockerfile:1

# The yarn cache mount is locked because the two install stages can run concurrently and yarn 1
# corrupts a cache shared by parallel installs.
#
# Layering rule: every stage copies its dependency manifest first, installs in its own layer, then
# copies only the inputs it builds from, least- to most-frequently-changing. A source edit reuses
# the install layers, and an edit to docs or tooling reuses the app build too.

# ── Stage 1: Install all dependencies (build-time) ───────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile

# ── Stage 2: Install production dependencies only (shipped in the runner) ────
FROM node:24-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile --production

# ── Stage 3: Build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Build configuration
COPY tsconfig.json next.config.js postcss.config.js tailwind.config.js global.d.ts ./

# Next.js app: its sources and the contract it shares with the server
COPY contract ./contract
COPY public ./public
COPY src ./src
RUN yarn build:next

# Express server: compiled with tsconfig paths into tests/, which the server's type-check includes
COPY tests ./tests
COPY server ./server
RUN yarn build:server

# ── Stage 4: Production runner ────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

# Links the published GHCR package to its repository.
LABEL org.opencontainers.image.source="https://github.com/nokternol/warden"

# dumb-init: lightweight init that properly forwards signals as PID 1.
# Ensures SIGTERM reaches the Node process for graceful shutdown.
# su-exec: drops privileges to PUID:PGID in the entrypoint and execs, adding no process.
RUN apk add --no-cache dumb-init su-exec

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./

# next({ dev: false }) loads this at runtime for images.remotePatterns (poster hosts) and the
# page extensions.
COPY next.config.js ./

# Express compiled output, including the Drizzle migration SQL that build:server places beside
# the compiled database module
COPY --from=builder /app/dist ./dist

# Next.js compiled output and static assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# config/ is mounted as a volume at runtime for SQLite db and logs.
# DB_PATH defaults to ./config/db/warden.db
# LOG_DIR defaults to ./config/logs
RUN mkdir -p /app/config
VOLUME ["/app/config"]

# Next.js writes its image-optimisation cache here as whichever user the entrypoint selects.
RUN mkdir -p /app/.next/cache && chmod 1777 /app/.next/cache

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

EXPOSE 5057

# /api/health is a public route. busybox wget ships with alpine, so no extra package is needed.
# start-period covers Next.js preparation and migrations before failures count.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:5057/api/health || exit 1

# The container starts as root so the entrypoint can adopt PUID/PGID, then runs the server as that
# user. dumb-init stays PID 1 so signals are forwarded correctly.
ENTRYPOINT ["dumb-init", "--", "entrypoint.sh"]
CMD ["node", "dist/server/index.js"]
