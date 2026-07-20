FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=4173

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js index.html app.css background.js runtime-env.js robots.txt sitemap.xml ./
COPY vendor ./vendor
COPY fonts ./fonts
COPY js ./js

USER node
EXPOSE 4173
CMD ["node", "server.js"]
