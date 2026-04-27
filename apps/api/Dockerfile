FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/utils/package.json ./packages/utils/
RUN pnpm install --frozen-lockfile --filter @seclettr/crypto... --filter @seclettr/protocol... --filter @seclettr/api...

# Build
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/crypto ./packages/crypto
COPY packages/protocol ./packages/protocol
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter @seclettr/crypto... --filter @seclettr/protocol... --filter @seclettr/api...
RUN pnpm --filter @seclettr/crypto build
RUN pnpm --filter @seclettr/protocol build
RUN pnpm --filter @seclettr/api build

# Production image
FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

# Copy full workspace to preserve pnpm workspace links at runtime.
COPY --from=build /app /app

WORKDIR /app/apps/api

ENV NODE_ENV=production
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
