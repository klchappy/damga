# =====================================================
# Damga Web — production image (Vite build + nginx)
# Build context: monorepo root
# =====================================================

FROM node:22-alpine AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/verification/package.json ./packages/verification/
RUN pnpm install --filter @damga/web... --filter @damga/shared

FROM deps AS build
ARG VITE_API_URL=https://api.damga.deploi.net
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @damga/web build

FROM nginx:1.31-alpine AS runtime
RUN apk add --no-cache curl wget
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost/healthz >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
