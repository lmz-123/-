FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm ci --omit=dev --no-audit \
    --registry="${NPM_REGISTRY}" \
    --replace-registry-host=always

COPY src ./src

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

USER node
CMD ["node", "src/server.js"]
