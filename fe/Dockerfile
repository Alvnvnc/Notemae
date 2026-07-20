# Node 22.18+ wajib: server.ts dijalankan apa adanya lewat type stripping bawaan
# Node, jadi sisi server tidak punya langkah build. Yang dibangun di stage
# pertama: klien (Vite -> dist/client) dan bundel SSR (vite build --ssr ->
# dist/server). Paket manager: pnpm (lihat packageManager di package.json).

# --- stage build: dist/client + dist/server ----------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

# Dependency dipasang lebih dulu, terpisah dari sumber, supaya layer-nya
# ter-cache selama pnpm-lock.yaml tidak berubah.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json vite.config.ts index.html ./
COPY scripts ./scripts
COPY src ./src
COPY public ./public
RUN pnpm run build

# --- stage runtime -----------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4173
RUN corepack enable

# --prod: vite, typescript, dan three tidak dibutuhkan saat jalan. three sudah
# terbundel ke chunk showcase3d (client, dynamic import) di stage build. Deps
# yang di-externalize bundel SSR (react-dom, react-router, gsap) ada di
# dependencies, jadi ikut terpasang.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

# SSR kini bundel mandiri di dist/server (renderToString), jadi hanya server.ts +
# dist yang perlu jalan - sumber di src tidak lagi disalin ke image runtime.
COPY server.ts ./
COPY --from=build /app/dist ./dist

USER node
EXPOSE 4173
CMD ["node", "server.ts"]
