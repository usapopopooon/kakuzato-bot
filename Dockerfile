FROM node:22-bookworm-slim AS deps

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci

FROM deps AS build

COPY tsconfig.json tsconfig.build.json vitest.config.ts ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src ./src
COPY static ./static
ENV DATABASE_URL=postgresql://kakuzato:password@db:5432/kakuzato_bot
RUN npm run build

FROM build AS migrator

CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM build AS production-deps

RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl fontconfig fonts-yozvox-yozfont-cute fonts-seto fonts-noto-cjk fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY static ./static
RUN chown -R node:node /app

USER node
CMD ["node", "dist/app/main.js"]
