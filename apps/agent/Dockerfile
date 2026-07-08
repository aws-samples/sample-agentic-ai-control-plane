FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:22-alpine AS deps
WORKDIR /app

RUN npm install -g corepack@latest && corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/agent/package.json ./apps/agent/
COPY packages/database/package.json ./packages/database/

RUN pnpm install --frozen-lockfile

FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:22-alpine AS builder
WORKDIR /app

RUN npm install -g corepack@latest && corepack enable

COPY --from=deps /app/ ./
COPY apps/agent/ ./apps/agent/
COPY packages/database/ ./packages/database/

RUN pnpm --filter @package/database exec prisma generate

# Bundle the agent with esbuild so the resulting file is plain ESM with all
# extensionless workspace imports resolved. Plain `tsc` would emit raw ESM
# that Node refuses (extensionless imports are invalid in Node ESM mode).
# Externalize the AWS SDK (huge, comes from node_modules) and Prisma's
# generated engine binaries (binary, must remain on disk).
WORKDIR /app/apps/agent
RUN pnpm exec esbuild index.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --format=esm \
    --outfile=dist/index.mjs \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
    --external:@prisma/client \
    --external:@prisma/adapter-pg \
    --external:.prisma/* \
    --external:pg-native \
    --external:@aws-sdk/*

FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:22-alpine AS runner
WORKDIR /app

# Bundle is self-contained for app code; node_modules carries the externalized
# packages above plus their native bits (Prisma engine binaries live there).
# pnpm workspaces store actual files in /app/node_modules/.pnpm and symlink
# from app-local node_modules — copy both so the symlinks resolve.
COPY --from=builder /app/apps/agent/dist ./apps/agent/dist
COPY --from=builder /app/apps/agent/package.json ./apps/agent/
COPY --from=builder /app/apps/agent/node_modules ./apps/agent/node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database/generated ./packages/database/generated

WORKDIR /app/apps/agent

# Run as a non-root user (the base node image ships an unprivileged `node`
# user). Avoids running the container process as root — a container-hardening
# best practice.
USER node

EXPOSE 8080

# Liveness probe: the agent serves GET /ping (see index.ts). Uses Node's
# built-in http client so no extra tooling is needed in the runtime image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/ping',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.mjs"]
