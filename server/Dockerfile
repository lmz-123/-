FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit

COPY src ./src

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

USER node
CMD ["node", "src/server.js"]
