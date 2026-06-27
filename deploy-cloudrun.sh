#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE="${SERVICE:-psevent-dev}"
REGION="${REGION:-asia-southeast3}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
MEMORY="${MEMORY:-1Gi}"
CPU="${CPU:-1}"
MAX_INSTANCES="${MAX_INSTANCES:-3}"
TIMEOUT="${TIMEOUT:-300s}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-true}"
ENABLE_APIS="${ENABLE_APIS:-true}"
NPM_PREFLIGHT="${NPM_PREFLIGHT:-true}"
BUILD_ROOT="${BUILD_ROOT:-$ROOT_DIR/.cloudrun-build}"
CONTEXT_DIR="$BUILD_ROOT/context"
RUNTIME_ENV_FILE="$BUILD_ROOT/runtime.env"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1" >&2
    exit 1
  fi
}

env_value() {
  local key="$1"
  local file="${2:-}"
  local from_env
  from_env="$(printenv "$key" 2>/dev/null || true)"
  if [[ -n "$from_env" ]]; then
    printf '%s' "$from_env"
    return
  fi
  if [[ -f "$file" ]]; then
    awk -v key="$key" '
      /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
      {
        line=$0
        sub(/^[[:space:]]*export[[:space:]]+/, "", line)
        split(line, parts, "=")
        k=parts[1]
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
        if (k == key) {
          sub(/^[^=]*=/, "", line)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
          gsub(/^"|"$/, "", line)
          gsub(/^'\''|'\''$/, "", line)
          print line
          exit
        }
      }
    ' "$file"
  fi
}

write_runtime_env_file() {
  local service_url="$1"
  local cors_origin="$service_url"

  if [[ -n "${CORS_ORIGIN:-}" ]]; then
    cors_origin="$CORS_ORIGIN"
  fi
  if [[ -n "${CORS_ORIGIN_EXTRA:-}" ]]; then
    if [[ -n "$cors_origin" ]]; then
      cors_origin="$cors_origin,$CORS_ORIGIN_EXTRA"
    else
      cors_origin="$CORS_ORIGIN_EXTRA"
    fi
  fi
  if [[ -z "$cors_origin" ]]; then
    cors_origin="https://placeholder.invalid"
  fi

  mkdir -p "$BUILD_ROOT"
  {
    echo "NODE_ENV=production"
    awk '
      /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
      {
        line=$0
        sub(/^[[:space:]]*export[[:space:]]+/, "", line)
        split(line, parts, "=")
        key=parts[1]
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
        if (key == "PORT" || key == "NODE_ENV" || key == "CORS_ORIGIN") next
        if (key !~ /^[A-Za-z_][A-Za-z0-9_]*$/) next
        sub(/^[^=]*=/, "", line)
        print key "=" line
      }
    ' "$ROOT_DIR/backend/.env" 2>/dev/null || true
    echo "CORS_ORIGIN=$cors_origin"
  } > "$RUNTIME_ENV_FILE"

  if ! grep -q '^MONGODB_URI=' "$RUNTIME_ENV_FILE"; then
    echo "Missing MONGODB_URI. Add it to backend/.env or export it before running this script." >&2
    exit 1
  fi
  if ! grep -q '^JWT_SECRET=' "$RUNTIME_ENV_FILE"; then
    echo "Missing JWT_SECRET. Add it to backend/.env or export it before running this script." >&2
    exit 1
  fi
  if ! grep -q '^SESSION_TOKEN_HASH_SECRET=' "$RUNTIME_ENV_FILE"; then
    echo "Missing SESSION_TOKEN_HASH_SECRET. Add it to backend/.env or export it before running this script." >&2
    exit 1
  fi
}

copy_source() {
  rm -rf "$CONTEXT_DIR"
  mkdir -p "$CONTEXT_DIR/backend" "$CONTEXT_DIR/frontend"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude 'node_modules' \
      --exclude '.env' \
      --exclude 'logs' \
      --exclude 'uploads' \
      "$ROOT_DIR/backend/" "$CONTEXT_DIR/backend/"
    rsync -a --delete \
      --exclude 'node_modules' \
      --exclude '.env' \
      --exclude 'dist' \
      "$ROOT_DIR/frontend/" "$CONTEXT_DIR/frontend/"
  else
    cp -R "$ROOT_DIR/backend/." "$CONTEXT_DIR/backend/"
    cp -R "$ROOT_DIR/frontend/." "$CONTEXT_DIR/frontend/"
    rm -rf \
      "$CONTEXT_DIR/backend/node_modules" \
      "$CONTEXT_DIR/backend/.env" \
      "$CONTEXT_DIR/backend/logs" \
      "$CONTEXT_DIR/backend/uploads" \
      "$CONTEXT_DIR/frontend/node_modules" \
      "$CONTEXT_DIR/frontend/.env" \
      "$CONTEXT_DIR/frontend/dist"
  fi
}

write_frontend_env() {
  local frontend_env="$ROOT_DIR/frontend/.env"
  local google_client_id
  local turnstile_site_key
  local cf_turnstile_site_key

  google_client_id="$(env_value VITE_GOOGLE_CLIENT_ID "$frontend_env")"
  turnstile_site_key="$(env_value VITE_TURNSTILE_SITE_KEY "$frontend_env")"
  cf_turnstile_site_key="$(env_value VITE_CF_TURNSTILE_SITE_KEY "$frontend_env")"

  {
    echo "VITE_API_BASE_URL=/api"
    [[ -n "$google_client_id" ]] && echo "VITE_GOOGLE_CLIENT_ID=$google_client_id"
    [[ -n "$turnstile_site_key" ]] && echo "VITE_TURNSTILE_SITE_KEY=$turnstile_site_key"
    [[ -n "$cf_turnstile_site_key" ]] && echo "VITE_CF_TURNSTILE_SITE_KEY=$cf_turnstile_site_key"
  } > "$CONTEXT_DIR/frontend/.env.production"
}

write_cloudrun_files() {
  cat > "$CONTEXT_DIR/backend/cloudrun-server.js" <<'EOF'
require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const app = require('./src/app');
const initScheduler = require('./src/cron/reportScheduler');

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');

app.use(express.static(frontendDist, {
  index: false,
  maxAge: '1h',
}));

app.get(/^(?!\/api(?:\/|$)|\/uploads(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Cloud Run server listening on port ${port}`);
});

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 30000),
}).then(() => {
  console.log('MongoDB connected!');
  initScheduler();
}).catch((err) => {
  console.error('MongoDB connection error:', err);
});

process.on('SIGTERM', () => {
  mongoose.connection.close(false).finally(() => {
    process.exit(0);
  });
});
EOF

  cat > "$CONTEXT_DIR/Dockerfile" <<'EOF'
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev || (echo "backend package-lock is out of sync; falling back to npm install for dev deploy" && npm install --omit=dev)

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
EXPOSE 8080
CMD ["node", "backend/cloudrun-server.js"]
EOF
}

preflight_package_locks() {
  if [[ "$NPM_PREFLIGHT" != "true" ]]; then
    return
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "Skipping npm preflight because npm is not installed locally."
    return
  fi

  echo "Checking frontend package lock..."
  npm --prefix "$CONTEXT_DIR/frontend" ci --dry-run --ignore-scripts

  echo "Checking backend package lock..."
  if ! npm --prefix "$CONTEXT_DIR/backend" ci --omit=dev --dry-run --ignore-scripts; then
    echo "Backend package lock is out of sync. Repairing build context package-lock.json..."
    npm --prefix "$CONTEXT_DIR/backend" install --package-lock-only --ignore-scripts
    npm --prefix "$CONTEXT_DIR/backend" ci --omit=dev --dry-run --ignore-scripts
  fi

  rm -rf "$CONTEXT_DIR/frontend/node_modules" "$CONTEXT_DIR/backend/node_modules"
}

deploy() {
  local auth_flag="--allow-unauthenticated"
  if [[ "$ALLOW_UNAUTHENTICATED" != "true" ]]; then
    auth_flag="--no-allow-unauthenticated"
  fi

  if [[ "$ENABLE_APIS" == "true" ]]; then
    gcloud services enable \
      run.googleapis.com \
      cloudbuild.googleapis.com \
      artifactregistry.googleapis.com \
      --project "$PROJECT_ID"
  fi

  gcloud run deploy "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --source "$CONTEXT_DIR" \
    --env-vars-file "$RUNTIME_ENV_FILE" \
    --memory "$MEMORY" \
    --cpu "$CPU" \
    --max-instances "$MAX_INSTANCES" \
    --timeout "$TIMEOUT" \
    "$auth_flag"
}

update_cors_if_first_deploy() {
  local old_url="$1"
  local new_url="$2"

  if [[ -n "$old_url" || -z "$new_url" || -n "${CORS_ORIGIN:-}" ]]; then
    return
  fi

  local cors_origin="$new_url"
  if [[ -n "${CORS_ORIGIN_EXTRA:-}" ]]; then
    cors_origin="$cors_origin,$CORS_ORIGIN_EXTRA"
  fi

  gcloud run services update "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --update-env-vars "^|^CORS_ORIGIN=$cors_origin"
}

main() {
  require_command gcloud

  if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
    echo "Set PROJECT_ID or run: gcloud config set project YOUR_PROJECT_ID" >&2
    exit 1
  fi

  local existing_url
  existing_url="$(gcloud run services describe "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)' 2>/dev/null || true)"

  write_runtime_env_file "$existing_url"
  copy_source
  write_frontend_env
  write_cloudrun_files
  preflight_package_locks
  deploy

  local service_url
  service_url="$(gcloud run services describe "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)')"

  update_cors_if_first_deploy "$existing_url" "$service_url"

  echo
  echo "Deployed Cloud Run service:"
  echo "$service_url"
  echo
  echo "For MongoDB Atlas dev testing, allow Cloud Run egress to reach your cluster."
  echo "For quick dev only, Atlas Network Access can temporarily allow 0.0.0.0/0."
}

main "$@"
