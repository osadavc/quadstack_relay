# syntax=docker/dockerfile:1

# One image definition, two targets:
#   setup  applies migrations and loads the datasets and accounts (bun runs the TypeScript)
#   web    the Next.js app, as a standalone Node server

FROM node:22-bookworm-slim AS base
RUN npm install -g bun@1.4.2 && bun --version
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock bunfig.toml ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/engine/package.json packages/engine/
RUN bun install --frozen-lockfile

FROM deps AS source
COPY . .

FROM source AS setup
CMD ["sh", "-c", "cd packages/db && bun src/migrate.ts && bun seed/index.ts"]

FROM source AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && ../../node_modules/.bin/next build

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
