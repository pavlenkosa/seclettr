# mediasoup requires build tools for native bindings
FROM node:22-alpine AS base
RUN apk add --no-cache python3 py3-pip make g++ linux-headers
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/sfu/package.json ./apps/sfu/
COPY packages/protocol/package.json ./packages/protocol/
RUN pnpm install --frozen-lockfile --filter @seclettr/protocol... --filter @seclettr/sfu...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/protocol ./packages/protocol
COPY apps/sfu ./apps/sfu
RUN pnpm install --frozen-lockfile --filter @seclettr/protocol... --filter @seclettr/sfu...
RUN pnpm --filter @seclettr/protocol build
RUN pnpm --filter @seclettr/sfu build

FROM node:22-alpine AS production
RUN apk add --no-cache python3 py3-pip make g++ linux-headers && \
    corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

# Copy full workspace to preserve pnpm workspace links at runtime.
COPY --from=build /app /app

WORKDIR /app/apps/sfu

ENV NODE_ENV=production
USER node
EXPOSE 3002
# SFU uses network_mode: host in compose so ports are not mapped here
CMD ["node", "dist/index.js"]
