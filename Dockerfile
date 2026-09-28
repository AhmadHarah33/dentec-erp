# Dentec ERP — production image.
#
#   docker build -t dentec-erp .
#   docker run -p 3000:3000 --env-file .env dentec-erp
#
# Supabase settings are read when the container starts, not when the image is
# built, so one image serves any environment. See docs/DEPLOY.md.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Shown in the browser, so it is compiled in: change it with --build-arg.
ARG NEXT_PUBLIC_TIME_ZONE=Europe/Istanbul
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone NEXT_PUBLIC_TIME_ZONE=$NEXT_PUBLIC_TIME_ZONE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 HOSTNAME=0.0.0.0 \
    CHROMIUM_PATH=/usr/bin/chromium \
    APP_INTERNAL_URL=http://127.0.0.1:3000 \
    DENTEC_DATA_DIR=/app/data

# Chromium renders invoice PDFs (Arabic shaping needs a real browser engine).
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd --system dentec && useradd --system --gid dentec --home /app dentec \
 && mkdir -p /app/data && chown dentec:dentec /app/data

COPY --from=build --chown=dentec:dentec /app/.next/standalone ./
COPY --from=build --chown=dentec:dentec /app/.next/static ./.next/static
COPY --from=build --chown=dentec:dentec /app/public ./public

USER dentec
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
