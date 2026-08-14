#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMMAND="${1:-help}"
GATEWAY_DIR="$ROOT_DIR/hosting/plesk-gateway"

log() {
  printf '[plesk-release] %s\n' "$*"
}

die() {
  printf '[plesk-release] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

require_node_22() {
  node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major === 22 && minor >= 22 ? 0 : 1);
  ' || die "Plesk Node.js >=22.22.0 <23 is required (found $(node --version))"
}

validate_manual_deploy_source() {
  require_command git
  local release_id
  release_id="$(node "$ROOT_DIR/scripts/verify-plesk-source.js")" \
    || die "Plesk deployment source verification failed"
  [[ "$release_id" =~ ^[0-9a-f]{40}$ ]] || die "Unable to resolve the Plesk Git commit"
  export PLESK_GIT_COMMIT="$release_id"
  log "Manual deployment source verified: ${PLESK_EXPECTED_BRANCH:-main} @ $release_id"
}

read_frontend_public_value() {
  local key="$1"
  [[ -f "$ROOT_DIR/frontend/.env" ]] || return 0
  awk -F= -v target="$key" '
    /^[[:space:]]*#/ { next }
    $1 == target {
      sub(/^[^=]*=/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  ' "$ROOT_DIR/frontend/.env"
}

load_local_public_config() {
  [[ "${LOAD_LOCAL_PLESK_CONFIG:-false}" == "true" ]] || return 0
  local key value
  for key in VITE_CF_TURNSTILE_SITE_KEY VITE_GOOGLE_CLIENT_ID VITE_LIFF_ID; do
    [[ -z "${!key:-}" ]] || continue
    value="$(read_frontend_public_value "$key")"
    [[ -n "$value" ]] || continue
    export "$key=$value"
  done
  log "Loaded allowlisted public frontend settings for a local Plesk build"
}

install_and_test_gateway() {
  log "Installing the locked Plesk gateway runtime"
  npm --prefix "$GATEWAY_DIR" ci --omit=dev --ignore-scripts
  log "Running Plesk gateway integration tests"
  npm --prefix "$GATEWAY_DIR" test
  npm --prefix "$GATEWAY_DIR" audit --omit=dev --audit-level=high
}

build_frontend() {
  [[ -n "${VITE_CF_TURNSTILE_SITE_KEY:-}" ]] \
    || die "VITE_CF_TURNSTILE_SITE_KEY must be configured as a public Plesk Node.js variable"
  log "Installing locked frontend build dependencies"
  npm --prefix "$ROOT_DIR/frontend" ci --include=dev
  log "Building the same-origin Plesk frontend"
  VITE_API_BASE_URL=/api npm --prefix "$ROOT_DIR/frontend" run build
  node "$ROOT_DIR/scripts/prepare-plesk-public.js"
  if [[ "${PLESK_KEEP_FRONTEND_NODE_MODULES:-false}" != "true" ]]; then
    node -e 'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })' \
      "$ROOT_DIR/frontend/node_modules"
  fi
}

restart_gateway() {
  mkdir -p "$GATEWAY_DIR/tmp"
  touch "$GATEWAY_DIR/tmp/restart.txt"
  log "Passenger restart marker updated"
}

plan() {
  printf '%s\n' \
    'Plesk target: reunion.scicu-alumni.com' \
    'Deployment: manual Pull now, then manual Deploy now' \
    'Git branch: main' \
    'Runtime: Node.js >=22.22.0 <23 / Production' \
    'Application root: hosting/plesk-gateway' \
    'Document root: hosting/plesk-gateway/public' \
    'Startup file: app.js' \
    'Plesk Git mirror fallback: ../git/RegisterSystem_Sci.git' \
    'Required public variables: PUBLIC_HOST, UPSTREAM_ORIGIN, VITE_CF_TURNSTILE_SITE_KEY' \
    'Optional public variables: VITE_GOOGLE_CLIENT_ID, VITE_LIFF_ID, UPSTREAM_TIMEOUT_MS, PLESK_GIT_DIR' \
    'Runtime secrets on Plesk: none'
}

usage() {
  cat <<'USAGE'
Usage: ./scripts/plesk-release.sh COMMAND

Commands:
  plan    Print non-secret Plesk Node.js settings.
  verify-source Verify the deployed tree against the selected Plesk Git commit.
  ci      Install and test the gateway without deploying.
  build   Test the gateway, build the frontend, and prepare public files.
  deploy  Build and update the Passenger restart marker.
  rollback Swap to the previous prepared frontend release and restart Passenger.
  smoke   Verify the public Plesk gateway and proxied Cloud Run API.

Plesk Git manual deployment action:
  ./scripts/release.sh plesk deploy
USAGE
}

require_command node
require_command npm
require_node_22
load_local_public_config

case "$COMMAND" in
  plan)
    plan
    ;;
  verify-source)
    validate_manual_deploy_source
    ;;
  ci)
    install_and_test_gateway
    ;;
  build)
    validate_manual_deploy_source
    install_and_test_gateway
    build_frontend
    ;;
  deploy)
    validate_manual_deploy_source
    install_and_test_gateway
    build_frontend
    restart_gateway
    ;;
  rollback)
    node "$ROOT_DIR/scripts/prepare-plesk-public.js" --rollback
    restart_gateway
    ;;
  smoke)
    node "$ROOT_DIR/scripts/smoke-plesk-gateway.js"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    die "Unknown command: $COMMAND"
    ;;
esac
