# =====================================================
# Damga API — production image
# Build context: monorepo root
# =====================================================

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /app

# ---- 1) deps ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/verification/package.json ./packages/verification/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --filter @damga/api... --filter @damga/shared --filter @damga/db --filter @damga/verification

# ---- 2) runtime ----
FROM base AS runtime
RUN apk add --no-cache curl
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/verification/node_modules ./packages/verification/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY packages/verification ./packages/verification
COPY apps/api ./apps/api

EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:4100/v1/health/healthz >/dev/null || exit 1

CMD ["pnpm", "--filter", "@damga/api", "exec", "tsx", "src/index.ts"]
