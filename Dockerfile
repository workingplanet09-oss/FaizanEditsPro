# syntax=docker/dockerfile:1
# One image for the web app and the background worker (`npm run worker`).
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs `prisma generate`
RUN npm ci

FROM deps AS build
COPY . .
# The build needs no database: every page renders per request. These values only satisfy config parsing.
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" AUTH_SECRET="build-time-placeholder-not-used-at-runtime" npm run build

FROM base AS run
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app /app
# Local storage (STORAGE_PROVIDER=local) lives here — mount a volume, or use S3/R2 in production.
RUN mkdir -p /app/.storage && chown -R node:node /app/.storage /app/.next
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
