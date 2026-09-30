# Payload v3 (Next.js standalone) production image.
# Build context is ./payload, wired from the root docker-compose.yaml.
# Node 24 to match the host toolchain that authored package-lock.json (npm 12).
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# NOTE: `npm ci` is intentionally NOT used. The lock file is authored on
# Windows and npm resolves a few transitive deps (yjs, monaco-editor, ...)
# differently on Linux, so strict `npm ci` fails in-container while the
# host install is healthy. Plain `npm install` tolerates that skew.
# `.npmrc` (legacy-peer-deps=true, same as host) must be copied too,
# otherwise peer resolution (e.g. graphql 17 vs payload's ^16.8.1) fails.
RUN npm install --no-audit --no-fund

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy build-time values so `next build` can run without a live DB.
# Real values are injected at runtime via docker-compose environment.
ARG DATABASE_URL=postgres://postgres:postgres@localhost:5432/payload
ARG PAYLOAD_SECRET=build-time-dummy-secret-override-at-runtime
ENV DATABASE_URL=$DATABASE_URL
ENV PAYLOAD_SECRET=$PAYLOAD_SECRET
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
# Full copy (not Next standalone): the runner needs the payload CLI +
# migration files so it can self-migrate (`payload migrate` is idempotent
# and a no-op when the DB is already current). This keeps
# `docker compose up -d` working on a wiped database with no host step.
COPY --from=builder --chown=nextjs:nodejs /app ./
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["sh", "-c", "npx payload migrate && npx next start -H 0.0.0.0 -p 3000"]
