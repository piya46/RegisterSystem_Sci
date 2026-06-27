#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-asia-southeast3}"
BACKEND_SERVICE="${BACKEND_SERVICE:-psevent-backend-dev}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-psevent-frontend-dev}"
BACKEND_MEMORY="${BACKEND_MEMORY:-1Gi}"
FRONTEND_MEMORY="${FRONTEND_MEMORY:-512Mi}"
CPU="${CPU:-1}"
MAX_INSTANCES="${MAX_INSTANCES:-3}"
TIMEOUT="${TIMEOUT:-300s}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-true}"
ENABLE_APIS="${ENABLE_APIS:-true}"
NPM_PREFLIGHT="${NPM_PREFLIGHT:-true}"
BUILD_ROOT="${BUILD_ROOT:-$ROOT_DIR/.cloudrun-split-build}"
BACKEND_CONTEXT="$BUILD_ROOT/backend"
FRONTEND_CONTEXT="$BUILD_ROOT/frontend"
BACKEND_ENV_FILE="$BUILD_ROOT/backend.env"

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

cloud_run_url() {
  local service="$1"
  gcloud run services describe "$service" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)' 2>/dev/null || true
}

write_backend_env_file() {
  local frontend_url="$1"
  local cors_origin="$frontend_url"

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
        if (key == "PORT" || key == "NODE_ENV" || key == "CORS_ORIGIN" || key == "COOKIE_SAME_SITE" || key == "COOKIE_SECURE") next
        if (key !~ /^[A-Za-z_][A-Za-z0-9_]*$/) next
        sub(/^[^=]*=/, "", line)
        print key "=" line
      }
    ' "$ROOT_DIR/backend/.env" 2>/dev/null || true
    echo "CORS_ORIGIN=$cors_origin"
    echo "COOKIE_SAME_SITE=none"
    echo "COOKIE_SECURE=true"
  } > "$BACKEND_ENV_FILE"

  for key in MONGODB_URI JWT_SECRET SESSION_TOKEN_HASH_SECRET; do
    if ! grep -q "^$key=" "$BACKEND_ENV_FILE"; then
      echo "Missing $key. Add it to backend/.env or export it before running this script." >&2
      exit 1
    fi
  done
}

copy_backend_source() {
  rm -rf "$BACKEND_CONTEXT"
  mkdir -p "$BACKEND_CONTEXT"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude 'node_modules' \
      --exclude '.env' \
      --exclude 'logs' \
      --exclude 'uploads' \
      --exclude '.DS_Store' \
      "$ROOT_DIR/backend/" "$BACKEND_CONTEXT/"
  else
    cp -R "$ROOT_DIR/backend/." "$BACKEND_CONTEXT/"
    rm -rf "$BACKEND_CONTEXT/node_modules" "$BACKEND_CONTEXT/.env" "$BACKEND_CONTEXT/logs" "$BACKEND_CONTEXT/uploads"
    find "$BACKEND_CONTEXT" -name .DS_Store -delete
  fi
}

copy_frontend_source() {
  rm -rf "$FRONTEND_CONTEXT"
  mkdir -p "$FRONTEND_CONTEXT"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude 'node_modules' \
      --exclude '.env' \
      --exclude 'dist' \
      --exclude '.DS_Store' \
      "$ROOT_DIR/frontend/" "$FRONTEND_CONTEXT/"
  else
    cp -R "$ROOT_DIR/frontend/." "$FRONTEND_CONTEXT/"
    rm -rf "$FRONTEND_CONTEXT/node_modules" "$FRONTEND_CONTEXT/.env" "$FRONTEND_CONTEXT/dist"
    find "$FRONTEND_CONTEXT" -name .DS_Store -delete
  fi
}

write_backend_files() {
  cat > "$BACKEND_CONTEXT/cloudrun-server.js" <<'EOF'
require('dotenv').config();

const mongoose = require('mongoose');
const app = require('./src/app');
const initScheduler = require('./src/cron/reportScheduler');

app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    dbState: mongoose.connection.readyState,
  });
});

const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Backend Cloud Run server listening on port ${port}`);
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

  cat > "$BACKEND_CONTEXT/Dockerfile" <<'EOF'
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/backend
COPY package*.json ./
RUN npm ci --omit=dev || (echo "backend package-lock is out of sync; falling back to npm install for dev deploy" && npm install --omit=dev)
COPY . .
EXPOSE 8080
CMD ["node", "cloudrun-server.js"]
EOF
}

write_frontend_files() {
  local backend_url="$1"
  local frontend_env="$ROOT_DIR/frontend/.env"
  local google_client_id
  local turnstile_site_key
  local cf_turnstile_site_key

  google_client_id="$(env_value VITE_GOOGLE_CLIENT_ID "$frontend_env")"
  turnstile_site_key="$(env_value VITE_TURNSTILE_SITE_KEY "$frontend_env")"
  cf_turnstile_site_key="$(env_value VITE_CF_TURNSTILE_SITE_KEY "$frontend_env")"

  {
    echo "VITE_API_BASE_URL=$backend_url/api"
    [[ -n "$google_client_id" ]] && echo "VITE_GOOGLE_CLIENT_ID=$google_client_id"
    [[ -n "$turnstile_site_key" ]] && echo "VITE_TURNSTILE_SITE_KEY=$turnstile_site_key"
    [[ -n "$cf_turnstile_site_key" ]] && echo "VITE_CF_TURNSTILE_SITE_KEY=$cf_turnstile_site_key"
  } > "$FRONTEND_CONTEXT/.env.production"

  cat > "$FRONTEND_CONTEXT/nginx.conf" <<'EOF'
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

  cat > "$FRONTEND_CONTEXT/Dockerfile" <<'EOF'
FROM node:22-bookworm-slim AS build
WORKDIR /app/frontend
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
EOF
}

preflight_backend() {
  if [[ "$NPM_PREFLIGHT" != "true" ]]; then
    return
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "Skipping backend npm preflight because npm is not installed locally."
    return
  fi

  echo "Checking backend package lock..."
  if ! npm --prefix "$BACKEND_CONTEXT" ci --omit=dev --dry-run --ignore-scripts; then
    echo "Backend package lock is out of sync. Repairing build context package-lock.json..."
    npm --prefix "$BACKEND_CONTEXT" install --package-lock-only --ignore-scripts
    npm --prefix "$BACKEND_CONTEXT" ci --omit=dev --dry-run --ignore-scripts
  fi
  rm -rf "$BACKEND_CONTEXT/node_modules"
}

preflight_frontend() {
  if [[ "$NPM_PREFLIGHT" != "true" ]]; then
    return
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "Skipping frontend npm preflight because npm is not installed locally."
    return
  fi

  echo "Checking frontend package lock..."
  npm --prefix "$FRONTEND_CONTEXT" ci --dry-run --ignore-scripts
  rm -rf "$FRONTEND_CONTEXT/node_modules"
}

auth_flag() {
  if [[ "$ALLOW_UNAUTHENTICATED" == "true" ]]; then
    echo "--allow-unauthenticated"
  else
    echo "--no-allow-unauthenticated"
  fi
}

deploy_backend() {
  gcloud run deploy "$BACKEND_SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --source "$BACKEND_CONTEXT" \
    --env-vars-file "$BACKEND_ENV_FILE" \
    --memory "$BACKEND_MEMORY" \
    --cpu "$CPU" \
    --max-instances "$MAX_INSTANCES" \
    --timeout "$TIMEOUT" \
    "$(auth_flag)"
}

deploy_frontend() {
  gcloud run deploy "$FRONTEND_SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --source "$FRONTEND_CONTEXT" \
    --memory "$FRONTEND_MEMORY" \
    --cpu "$CPU" \
    --max-instances "$MAX_INSTANCES" \
    --timeout "$TIMEOUT" \
    "$(auth_flag)"
}

update_backend_cors() {
  local frontend_url="$1"
  local cors_origin="$frontend_url"

  if [[ -n "${CORS_ORIGIN_EXTRA:-}" ]]; then
    cors_origin="$cors_origin,$CORS_ORIGIN_EXTRA"
  fi

  gcloud run services update "$BACKEND_SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --update-env-vars "^|^CORS_ORIGIN=$cors_origin|COOKIE_SAME_SITE=none|COOKIE_SECURE=true"
}

main() {
  require_command gcloud

  if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
    echo "Set PROJECT_ID or run: gcloud config set project YOUR_PROJECT_ID" >&2
    exit 1
  fi

  if [[ "$ENABLE_APIS" == "true" ]]; then
    gcloud services enable \
      run.googleapis.com \
      cloudbuild.googleapis.com \
      artifactregistry.googleapis.com \
      --project "$PROJECT_ID"
  fi

  local existing_frontend_url
  existing_frontend_url="$(cloud_run_url "$FRONTEND_SERVICE")"

  write_backend_env_file "$existing_frontend_url"
  copy_backend_source
  write_backend_files
  preflight_backend
  deploy_backend

  local backend_url
  backend_url="$(cloud_run_url "$BACKEND_SERVICE")"
  if [[ -z "$backend_url" ]]; then
    echo "Backend deployed but URL could not be resolved." >&2
    exit 1
  fi

  copy_frontend_source
  write_frontend_files "$backend_url"
  preflight_frontend
  deploy_frontend

  local frontend_url
  frontend_url="$(cloud_run_url "$FRONTEND_SERVICE")"
  if [[ -z "$frontend_url" ]]; then
    echo "Frontend deployed but URL could not be resolved." >&2
    exit 1
  fi

  update_backend_cors "$frontend_url"

  echo
  echo "Backend URL:"
  echo "$backend_url"
  echo
  echo "Frontend URL:"
  echo "$frontend_url"
  echo
  echo "Frontend calls:"
  echo "$backend_url/api"
}

main "$@"
