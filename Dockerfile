FROM node:22-bookworm-slim AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build

COPY tsconfig.json tsconfig.build.json vitest.config.ts ./
COPY src ./src
COPY static ./static
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-yozvox-yozfont-cute fonts-seto fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY static ./static
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node
CMD ["node", "dist/app/main.js"]
