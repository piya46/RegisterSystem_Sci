#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "deploy-cloudrun.sh now delegates to the guarded unified release pipeline." >&2
exec "$ROOT_DIR/scripts/release.sh" deploy "${DEPLOY_ENVIRONMENT:-staging}"
