# BRIP core — production image. Multi-stage: build the workspace, then run core.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable

# Install with the lockfile using only manifests first (better layer caching).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/middleware-node/package.json packages/middleware-node/
COPY packages/cli/package.json packages/cli/
RUN pnpm install --frozen-lockfile

# Build core (emits packages/core/dist). drizzle/ migrations ship as-is.
COPY . .
RUN pnpm --filter @brip/core build

FROM node:22-slim AS run
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    RUN_MIGRATIONS=true \
    SEED_ON_BOOT=true
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/packages/core
EXPOSE 3000
# Boot applies migrations, seeds the demo publisher, then serves.
CMD ["node", "dist/main.js"]
