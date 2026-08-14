# syntax=docker/dockerfile:1.7

FROM node:22.22.0-bookworm-slim AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY frontend/ ./

ARG VITE_API_BASE_URL=/api
ARG VITE_CF_TURNSTILE_SITE_KEY=
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_LIFF_ID=
ARG VITE_SESSION_IDLE_TIMEOUT_MS=1800000
ARG VITE_SESSION_CHECK_INTERVAL_MS=60000
ARG VITE_SESSION_REFRESH_THRESHOLD_MS=300000
ARG VITE_PARTICIPANT_SESSION_REFRESH_THRESHOLD_MS=300000

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_CF_TURNSTILE_SITE_KEY=$VITE_CF_TURNSTILE_SITE_KEY \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_LIFF_ID=$VITE_LIFF_ID \
    VITE_SESSION_IDLE_TIMEOUT_MS=$VITE_SESSION_IDLE_TIMEOUT_MS \
    VITE_SESSION_CHECK_INTERVAL_MS=$VITE_SESSION_CHECK_INTERVAL_MS \
    VITE_SESSION_REFRESH_THRESHOLD_MS=$VITE_SESSION_REFRESH_THRESHOLD_MS \
    VITE_PARTICIPANT_SESSION_REFRESH_THRESHOLD_MS=$VITE_PARTICIPANT_SESSION_REFRESH_THRESHOLD_MS

RUN npm run build

FROM node:22.22.0-bookworm-slim AS backend-dependencies
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM node:22.22.0-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    SERVE_FRONTEND=true \
    FRONTEND_DIST_DIR=/app/frontend/dist

WORKDIR /app

COPY --from=backend-dependencies --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --chown=node:node backend/package.json backend/package-lock.json ./backend/
COPY --chown=node:node backend/src ./backend/src
COPY --from=frontend-build --chown=node:node /app/frontend/dist ./frontend/dist

USER node
EXPOSE 8080

CMD ["node", "backend/src/server.js"]
