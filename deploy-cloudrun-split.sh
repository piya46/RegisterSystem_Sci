#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Split deployment is retired; frontend and API now share one Cloud Run service and origin." >&2
exec "$ROOT_DIR/scripts/release.sh" deploy "${DEPLOY_ENVIRONMENT:-staging}"
