FROM public.ecr.aws/docker/library/node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

RUN npm install -g corepack@latest && corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/auth/package.json ./packages/auth/
COPY packages/api/package.json ./packages/api/
COPY packages/database/package.json ./packages/database/
COPY packages/policy/package.json ./packages/policy/
COPY packages/aws-user-agent/package.json ./packages/aws-user-agent/

RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app

RUN npm install -g corepack@latest && corepack enable

COPY --from=deps /app/ ./
COPY apps/web/ ./apps/web/
COPY packages/auth/ ./packages/auth/
COPY packages/api/ ./packages/api/
COPY packages/database/ ./packages/database/
COPY packages/policy/ ./packages/policy/
COPY packages/aws-user-agent/ ./packages/aws-user-agent/

RUN pnpm --filter @package/database exec prisma generate

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_URL
ARG NEXT_PUBLIC_BACKEND_URL

WORKDIR /app/apps/web
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN NEXT_PUBLIC_URL=$NEXT_PUBLIC_URL NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL pnpm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN apk add --no-cache nginx openssl

COPY --from=builder /app/apps/web/public ./apps/web/public
RUN mkdir -p apps/web/.next
RUN chown nextjs:nodejs apps/web/.next

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

# Liveness probe: the app serves GET /api/status (see app/api/status/route.ts).
# Uses Node's built-in http client so no extra tooling is needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/status',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
