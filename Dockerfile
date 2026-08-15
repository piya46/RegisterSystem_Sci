# syntax=docker/dockerfile:1.7

FROM node:22.22.0-bookworm-slim AS backend-dependencies
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM node:22.22.0-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    SERVE_FRONTEND=false

WORKDIR /app

COPY --from=backend-dependencies --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --chown=node:node backend/package.json backend/package-lock.json ./backend/
COPY --chown=node:node backend/src ./backend/src

USER node
EXPOSE 8080

CMD ["node", "backend/src/server.js"]
