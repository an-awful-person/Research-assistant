# Builds the application and runs its research server, which also serves the page. Ollama runs outside this container.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
# Lets "npm start" on the same computer say that the Docker version is the one running.
ENV RUNS_IN_DOCKER=true
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3001) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server/index.ts"]
