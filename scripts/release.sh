#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMMAND="${1:-help}"
DEPLOY_ENVIRONMENT="${2:-${DEPLOY_ENVIRONMENT:-staging}}"
CONFIG_FILE="$ROOT_DIR/deploy/environments/$DEPLOY_ENVIRONMENT.env"
RELEASE_DIR="$ROOT_DIR/.release"

log() {
  printf '[release] %s\n' "$*"
}

die() {
  printf '[release] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

require_ci_node_version() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "$major" == "22" ]] || die "Node.js 22 is required for reproducible CI/deployment (found $(node --version))"
}

load_config() {
  [[ "$DEPLOY_ENVIRONMENT" == "staging" || "$DEPLOY_ENVIRONMENT" == "production" ]] \
    || die "Environment must be staging or production"
  [[ -f "$CONFIG_FILE" ]] || die "Missing configuration file: $CONFIG_FILE"

  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    key="${key//[[:space:]]/}"
    [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || die "Invalid key in $CONFIG_FILE: $key"
    if [[ -z "${!key+x}" ]]; then
      export "$key=$value"
    fi
  done < "$CONFIG_FILE"

  export DEPLOY_ENVIRONMENT
  REGION="${REGION:-asia-southeast3}"
  ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-psevent}"
  CPU="${CPU:-1}"
  MEMORY="${MEMORY:-1Gi}"
  MIN_INSTANCES="${MIN_INSTANCES:-0}"
  MAX_INSTANCES="${MAX_INSTANCES:-2}"
  CONCURRENCY="${CONCURRENCY:-40}"
  REQUEST_TIMEOUT="${REQUEST_TIMEOUT:-300s}"
  PUBLIC_SERVICE="${PUBLIC_SERVICE:-true}"
  RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-psevent-runtime-$DEPLOY_ENVIRONMENT}"
  MIGRATION_SERVICE_ACCOUNT="${MIGRATION_SERVICE_ACCOUNT:-psevent-migration-$DEPLOY_ENVIRONMENT}"
  DEPLOYER_SERVICE_ACCOUNT="${DEPLOYER_SERVICE_ACCOUNT:-psevent-deployer-$DEPLOY_ENVIRONMENT}"
  SECRET_MANAGER_PREFIX="${SECRET_MANAGER_PREFIX:-psevent-$DEPLOY_ENVIRONMENT}"
  GCS_LOCATION="${GCS_LOCATION:-$REGION}"
  GCS_OBJECT_PREFIX="${GCS_OBJECT_PREFIX:-psevent/$DEPLOY_ENVIRONMENT}"
  export REGION ARTIFACT_REPOSITORY CPU MEMORY MIN_INSTANCES MAX_INSTANCES CONCURRENCY
  export REQUEST_TIMEOUT PUBLIC_SERVICE RUNTIME_SERVICE_ACCOUNT MIGRATION_SERVICE_ACCOUNT
  export DEPLOYER_SERVICE_ACCOUNT SECRET_MANAGER_PREFIX GCS_LOCATION GCS_OBJECT_PREFIX
}

resolve_project() {
  require_command gcloud
  PROJECT_ID="${PROJECT_ID:-${GCP_PROJECT_ID:-}}"
  if [[ -z "$PROJECT_ID" ]]; then
    PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
  fi
  [[ -n "$PROJECT_ID" && "$PROJECT_ID" != "(unset)" ]] || die "Set PROJECT_ID or configure a gcloud project"
  [[ "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || die "Invalid PROJECT_ID: $PROJECT_ID"
  PROJECT_NUMBER="${PROJECT_NUMBER:-$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')}"
  [[ "$PROJECT_NUMBER" =~ ^[0-9]+$ ]] || die "Unable to resolve PROJECT_NUMBER"
  GCS_BUCKET="${GCS_BUCKET:-$(printf '%s' "$PROJECT_ID-$SERVICE-assets" | tr '[:upper:]_' '[:lower:]-' | tr -cd 'a-z0-9.-' | cut -c1-63 | sed 's/[^a-z0-9]*$//')}"
  APP_ORIGIN="${APP_ORIGIN:-https://$SERVICE-$PROJECT_NUMBER.$REGION.run.app}"
  RUNTIME_SERVICE_ACCOUNT_EMAIL="${RUNTIME_SERVICE_ACCOUNT_EMAIL:-$RUNTIME_SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com}"
  MIGRATION_SERVICE_ACCOUNT_EMAIL="${MIGRATION_SERVICE_ACCOUNT_EMAIL:-$MIGRATION_SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com}"
  DEPLOYER_SERVICE_ACCOUNT_EMAIL="${DEPLOYER_SERVICE_ACCOUNT_EMAIL:-$DEPLOYER_SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com}"
  export PROJECT_ID PROJECT_NUMBER GCS_BUCKET APP_ORIGIN
  export RUNTIME_SERVICE_ACCOUNT_EMAIL MIGRATION_SERVICE_ACCOUNT_EMAIL DEPLOYER_SERVICE_ACCOUNT_EMAIL
}

release_id() {
  local revision
  revision="${RELEASE_ID:-${GITHUB_SHA:-}}"
  if [[ -z "$revision" ]]; then
    revision="$(git -C "$ROOT_DIR" rev-parse HEAD)"
  fi
  [[ "$revision" =~ ^[0-9a-fA-F]{7,40}$ ]] || die "RELEASE_ID must be a Git commit SHA"
  printf '%s' "$(printf '%s' "$revision" | tr '[:upper:]' '[:lower:]')"
}

read_public_frontend_value() {
  local key="$1"
  local current="${!key:-}"
  if [[ -n "$current" ]]; then
    printf '%s' "$current"
    return
  fi
  if [[ -f "$ROOT_DIR/frontend/.env" ]]; then
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
  fi
}

read_local_backend_value() {
  local key="$1"
  local source_file="${LOCAL_DEPLOY_CONFIG_FILE:-$ROOT_DIR/backend/.env}"
  [[ -f "$source_file" ]] || return 0
  awk -F= -v target="$key" '
    /^[[:space:]]*#/ { next }
    $1 == target {
      sub(/^[^=]*=/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  ' "$source_file"
}

load_local_nonsecret_config() {
  [[ "${LOAD_LOCAL_DEPLOY_CONFIG:-false}" == "true" ]] || return 0
  local keys=(SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_FROM LOGIN_CLIENT_ID)
  if [[ "${LINE_LOGIN_ENABLED:-false}" == "true" ]]; then
    keys+=(LINE_LOGIN_CHANNEL_ID LINE_LOGIN_SCOPE)
  fi
  if [[ "${LINE_MESSAGING_ENABLED:-false}" == "true" ]]; then
    keys+=(LINE_GROUP_ID)
  fi
  if [[ "${GOOGLE_DRIVE_ENABLED:-false}" == "true" ]]; then
    keys+=(GOOGLE_CLIENT_ID GOOGLE_DRIVE_FOLDER_ID)
  fi

  local key value
  local loaded=()
  for key in "${keys[@]}"; do
    [[ -z "${!key:-}" ]] || continue
    value="$(read_local_backend_value "$key")"
    [[ -n "$value" ]] || continue
    export "$key=$value"
    loaded+=("$key")
  done
  if (( ${#loaded[@]} > 0 )); then
    log "Loaded local non-secret deployment settings: ${loaded[*]}"
  fi
}

quality_gate() {
  require_command node
  require_command npm
  require_ci_node_version
  log "Installing locked backend dependencies"
  npm --prefix "$ROOT_DIR/backend" ci
  log "Installing locked frontend dependencies"
  npm --prefix "$ROOT_DIR/frontend" ci
  log "Running backend tests and syntax checks"
  npm --prefix "$ROOT_DIR/backend" test
  log "Running frontend lint and production build"
  npm --prefix "$ROOT_DIR/frontend" run lint
  npm --prefix "$ROOT_DIR/frontend" run build
  log "Checking high and critical dependency advisories"
  npm --prefix "$ROOT_DIR/backend" audit --omit=dev --audit-level=high
  npm --prefix "$ROOT_DIR/frontend" audit --audit-level=high
  log "Validating deployment contracts"
  bash -n "$ROOT_DIR/scripts/release.sh" "$ROOT_DIR/deploy-cloudrun.sh" "$ROOT_DIR/deploy-cloudrun-split.sh"
  node "$ROOT_DIR/scripts/scan-secrets.js"
  node --test "$ROOT_DIR/scripts/deployment.test.js"

  if [[ "${CI_DOCKER_BUILD:-false}" == "true" ]]; then
    require_command docker
    local id site_key google_client_id liff_id
    id="$(release_id)"
    site_key="$(read_public_frontend_value VITE_CF_TURNSTILE_SITE_KEY)"
    google_client_id="$(read_public_frontend_value VITE_GOOGLE_CLIENT_ID)"
    liff_id="$(read_public_frontend_value VITE_LIFF_ID)"
    log "Building the immutable application container"
    docker build \
      --build-arg VITE_API_BASE_URL=/api \
      --build-arg "VITE_CF_TURNSTILE_SITE_KEY=$site_key" \
      --build-arg "VITE_GOOGLE_CLIENT_ID=$google_client_id" \
      --build-arg "VITE_LIFF_ID=$liff_id" \
      --tag "psevent-ci:${id:0:12}" \
      "$ROOT_DIR"
  fi
}

ensure_clean_release_source() {
  local dirty
  dirty="$(git -C "$ROOT_DIR" status --porcelain --untracked-files=normal)"
  if [[ -n "$dirty" && "${ALLOW_DIRTY_DEPLOY:-false}" != "true" ]]; then
    die "Deployment source is dirty. Commit it first or use ALLOW_DIRTY_DEPLOY=true for an explicit non-production test."
  fi
  if [[ "$DEPLOY_ENVIRONMENT" == "production" && -n "$dirty" ]]; then
    die "Production deployment from a dirty worktree is forbidden"
  fi
  if [[ "$DEPLOY_ENVIRONMENT" == "production" ]]; then
    [[ "${CONFIRM_PRODUCTION_DEPLOY:-}" == "production" ]] \
      || die "Production requires CONFIRM_PRODUCTION_DEPLOY=production"
    if [[ -n "${GITHUB_REF:-}" && "$GITHUB_REF" != "refs/heads/main" ]]; then
      die "Production deployment is allowed only from refs/heads/main"
    fi
  fi
}

create_service_account() {
  local name="$1"
  local display_name="$2"
  if ! gcloud iam service-accounts describe "$name@$PROJECT_ID.iam.gserviceaccount.com" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$name" --project "$PROJECT_ID" --display-name "$display_name"
  fi
}

add_project_role() {
  local member="$1"
  local role="$2"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "$member" --role "$role" --condition=None --quiet >/dev/null
}

configure_workload_identity() {
  local repository="${GITHUB_REPOSITORY:-}"
  if [[ -z "$repository" ]]; then
    repository="$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null \
      | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' || true)"
  fi
  [[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] \
    || die "Set GITHUB_REPOSITORY=owner/repository for Workload Identity Federation"

  local repository_id="${GITHUB_REPOSITORY_ID:-}"
  local owner_id="${GITHUB_REPOSITORY_OWNER_ID:-}"
  if [[ -z "$repository_id" || -z "$owner_id" ]]; then
    require_command curl
    require_command jq
    local repository_json
    repository_json="$(curl --fail --silent --show-error "https://api.github.com/repos/$repository")" \
      || die "Unable to resolve numeric GitHub repository identities; set GITHUB_REPOSITORY_ID and GITHUB_REPOSITORY_OWNER_ID"
    repository_id="$(printf '%s' "$repository_json" | jq -r '.id // empty')"
    owner_id="$(printf '%s' "$repository_json" | jq -r '.owner.id // empty')"
  fi
  [[ "$repository_id" =~ ^[0-9]+$ && "$owner_id" =~ ^[0-9]+$ ]] \
    || die "GitHub repository and owner IDs must be numeric"

  local pool_id="${WIF_POOL_ID:-psevent-github}"
  local provider_id="${WIF_PROVIDER_ID:-github}"
  if ! gcloud iam workload-identity-pools describe "$pool_id" \
    --project "$PROJECT_ID" --location global >/dev/null 2>&1; then
    gcloud iam workload-identity-pools create "$pool_id" \
      --project "$PROJECT_ID" --location global --display-name "PSEvent GitHub Actions"
  fi

  local mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref"
  local condition="assertion.repository_id == '$repository_id' && assertion.repository_owner_id == '$owner_id' && assertion.ref == 'refs/heads/main'"
  if gcloud iam workload-identity-pools providers describe "$provider_id" \
    --project "$PROJECT_ID" --location global --workload-identity-pool "$pool_id" >/dev/null 2>&1; then
    gcloud iam workload-identity-pools providers update-oidc "$provider_id" \
      --project "$PROJECT_ID" --location global --workload-identity-pool "$pool_id" \
      --issuer-uri "https://token.actions.githubusercontent.com" \
      --attribute-mapping "$mapping" --attribute-condition "$condition"
  else
    gcloud iam workload-identity-pools providers create-oidc "$provider_id" \
      --project "$PROJECT_ID" --location global --workload-identity-pool "$pool_id" \
      --display-name "GitHub $repository" \
      --issuer-uri "https://token.actions.githubusercontent.com" \
      --attribute-mapping "$mapping" --attribute-condition "$condition"
  fi

  local principal="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$pool_id/attribute.repository_id/$repository_id"
  gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SERVICE_ACCOUNT_EMAIL" \
    --project "$PROJECT_ID" --member "$principal" --role roles/iam.workloadIdentityUser --quiet >/dev/null
  WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$pool_id/providers/$provider_id"
  export WIF_PROVIDER
  log "GitHub OIDC restricted to repository ID $repository_id, owner ID $owner_id, and refs/heads/main"
}

configure_storage() {
  [[ "${OBJECT_STORAGE_PROVIDER:-gcs}" == "gcs" ]] || return 0
  require_command node
  local lifecycle_file
  lifecycle_file="$(GCS_LIFECYCLE_FILE="$RELEASE_DIR/gcs-lifecycle-$DEPLOY_ENVIRONMENT.json" \
    node "$ROOT_DIR/scripts/render-gcs-lifecycle.js")"

  if ! gcloud storage buckets describe "gs://$GCS_BUCKET" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud storage buckets create "gs://$GCS_BUCKET" \
      --project "$PROJECT_ID" \
      --location "$GCS_LOCATION" \
      --default-storage-class STANDARD \
      --uniform-bucket-level-access \
      --public-access-prevention \
      --soft-delete-duration 7d \
      --lifecycle-file "$lifecycle_file"
  elif [[ "${ALLOW_BUCKET_POLICY_UPDATE:-false}" == "true" ]]; then
    gcloud storage buckets update "gs://$GCS_BUCKET" \
      --project "$PROJECT_ID" \
      --default-storage-class STANDARD \
      --uniform-bucket-level-access \
      --public-access-prevention \
      --no-versioning \
      --no-default-event-based-hold \
      --soft-delete-duration 7d \
      --lifecycle-file "$lifecycle_file"
  fi

  gcloud storage buckets add-iam-policy-binding "gs://$GCS_BUCKET" \
    --project "$PROJECT_ID" --member "serviceAccount:$RUNTIME_SERVICE_ACCOUNT_EMAIL" \
    --role roles/storage.objectUser --quiet >/dev/null
  add_project_role "serviceAccount:$RUNTIME_SERVICE_ACCOUNT_EMAIL" roles/storage.bucketViewer
  gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SERVICE_ACCOUNT_EMAIL" \
    --project "$PROJECT_ID" --member "serviceAccount:$RUNTIME_SERVICE_ACCOUNT_EMAIL" \
    --role roles/iam.serviceAccountTokenCreator --quiet >/dev/null
}

configure_budget() {
  if [[ "${BUDGET_CREATE:-false}" != "true" ]]; then
    if [[ "$DEPLOY_ENVIRONMENT" == "production" && "${BUDGET_ALREADY_CONFIGURED:-false}" != "true" ]]; then
      die "Production bootstrap requires BUDGET_CREATE=true or BUDGET_ALREADY_CONFIGURED=true"
    fi
    log "Billing Budget creation skipped; verify 50/80/90/100% alerts before enabling CD"
    return
  fi

  local billing_account="${BILLING_ACCOUNT_ID:-}"
  if [[ -z "$billing_account" ]]; then
    billing_account="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null \
      | sed 's#billingAccounts/##')"
  fi
  [[ -n "$billing_account" ]] || die "Unable to resolve BILLING_ACCOUNT_ID for budget creation"
  gcloud services enable billingbudgets.googleapis.com --project "$PROJECT_ID"
  local display_name="PSEvent $DEPLOY_ENVIRONMENT <= 1000 THB"
  local existing
  existing="$(gcloud billing budgets list --billing-account "$billing_account" \
    --filter "displayName=$display_name" --format='value(name)' --limit 1 2>/dev/null || true)"
  if [[ -z "$existing" ]]; then
    gcloud billing budgets create \
      --billing-account "$billing_account" \
      --display-name "$display_name" \
      --budget-amount "${GOOGLE_CLOUD_MONTHLY_BUDGET_THB:-1000}THB" \
      --filter-projects "projects/$PROJECT_ID" \
      --threshold-rule percent=0.50 \
      --threshold-rule percent=0.80 \
      --threshold-rule percent=0.90 \
      --threshold-rule percent=1.00
  fi
}

bootstrap_gcp() {
  [[ "${BOOTSTRAP_GCP:-false}" == "true" ]] \
    || die "Google Cloud bootstrap requires the explicit gate BOOTSTRAP_GCP=true"
  resolve_project
  mkdir -p "$RELEASE_DIR"
  chmod 700 "$RELEASE_DIR"
  log "Enabling required Google Cloud APIs in $PROJECT_ID"
  gcloud services enable \
    run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
    iamcredentials.googleapis.com sts.googleapis.com storage.googleapis.com \
    --project "$PROJECT_ID"

  if ! gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" \
    --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1; then
    gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \
      --project "$PROJECT_ID" --location "$REGION" --repository-format docker \
      --description "PSEvent immutable application images"
  fi
  local cleanup_mode="--dry-run"
  [[ "${ARTIFACT_CLEANUP_ACTIVE:-false}" == "true" ]] && cleanup_mode="--no-dry-run"
  gcloud artifacts repositories set-cleanup-policies "$ARTIFACT_REPOSITORY" \
    --project "$PROJECT_ID" --location "$REGION" \
    --policy "$ROOT_DIR/deploy/artifact-cleanup-policy.json" "$cleanup_mode"

  create_service_account "$RUNTIME_SERVICE_ACCOUNT" "PSEvent runtime $DEPLOY_ENVIRONMENT"
  create_service_account "$MIGRATION_SERVICE_ACCOUNT" "PSEvent migration $DEPLOY_ENVIRONMENT"
  create_service_account "$DEPLOYER_SERVICE_ACCOUNT" "PSEvent GitHub deployer $DEPLOY_ENVIRONMENT"

  add_project_role "serviceAccount:$DEPLOYER_SERVICE_ACCOUNT_EMAIL" roles/run.developer
  add_project_role "serviceAccount:$DEPLOYER_SERVICE_ACCOUNT_EMAIL" roles/serviceusage.serviceUsageConsumer
  gcloud artifacts repositories add-iam-policy-binding "$ARTIFACT_REPOSITORY" \
    --project "$PROJECT_ID" --location "$REGION" \
    --member "serviceAccount:$DEPLOYER_SERVICE_ACCOUNT_EMAIL" \
    --role roles/artifactregistry.writer --quiet >/dev/null
  for account in "$RUNTIME_SERVICE_ACCOUNT_EMAIL" "$MIGRATION_SERVICE_ACCOUNT_EMAIL"; do
    gcloud iam service-accounts add-iam-policy-binding "$account" \
      --project "$PROJECT_ID" --member "serviceAccount:$DEPLOYER_SERVICE_ACCOUNT_EMAIL" \
      --role roles/iam.serviceAccountUser --quiet >/dev/null
  done

  configure_workload_identity
  configure_storage
  configure_budget

  if ! gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
    log "Creating the public scale-to-zero service shell; application traffic remains on this shell until a release passes"
    local auth_flag="--no-allow-unauthenticated"
    [[ "$PUBLIC_SERVICE" == "true" ]] && auth_flag="--allow-unauthenticated"
    gcloud run deploy "$SERVICE" \
      --project "$PROJECT_ID" --region "$REGION" \
      --image us-docker.pkg.dev/cloudrun/container/hello \
      --service-account "$RUNTIME_SERVICE_ACCOUNT_EMAIL" \
      --cpu "$CPU" --memory "$MEMORY" --min-instances 0 --max-instances 1 \
      --concurrency "$CONCURRENCY" --timeout "$REQUEST_TIMEOUT" \
      --execution-environment gen2 --port 8080 "$auth_flag" --quiet
  fi

  log "Bootstrap complete"
  printf 'GCP_PROJECT_ID=%s\nWIF_PROVIDER=%s\nDEPLOYER_SERVICE_ACCOUNT=%s\nAPP_ORIGIN=%s\nGCS_BUCKET=%s\n' \
    "$PROJECT_ID" "$WIF_PROVIDER" "$DEPLOYER_SERVICE_ACCOUNT_EMAIL" "$APP_ORIGIN" "$GCS_BUCKET"
}

sync_secrets() {
  resolve_project
  require_command node
  node "$ROOT_DIR/scripts/sync-secrets.js" "$DEPLOY_ENVIRONMENT"
}

render_runtime_env() {
  RUNTIME_ENV_FILE="$RELEASE_DIR/runtime-$DEPLOY_ENVIRONMENT.yaml" \
    RELEASE_ID="$RELEASE_ID" node "$ROOT_DIR/scripts/render-runtime-env.js" "$DEPLOY_ENVIRONMENT" >/dev/null
  chmod 600 "$RELEASE_DIR/runtime-$DEPLOY_ENVIRONMENT.yaml"
}

build_and_push() {
  require_command docker
  local registry="$REGION-docker.pkg.dev"
  local build_id image_tag image_reference metadata_file digest
  build_id="${GITHUB_RUN_ID:-local-$(date -u +%Y%m%d%H%M%S)}-${GITHUB_RUN_ATTEMPT:-1}"
  build_id="$(printf '%s' "$build_id" | tr '[:upper:]_' '[:lower:]-' | tr -cd 'a-z0-9-')"
  image_tag="${RELEASE_ID}-${build_id}"
  image_reference="$registry/$PROJECT_ID/$ARTIFACT_REPOSITORY/$SERVICE:$image_tag"
  metadata_file="$RELEASE_DIR/build-metadata.json"
  local site_key google_client_id liff_id
  site_key="$(read_public_frontend_value VITE_CF_TURNSTILE_SITE_KEY)"
  google_client_id="$(read_public_frontend_value VITE_GOOGLE_CLIENT_ID)"
  liff_id="$(read_public_frontend_value VITE_LIFF_ID)"
  [[ -n "$site_key" ]] || die "VITE_CF_TURNSTILE_SITE_KEY is required for deployment"

  gcloud auth configure-docker "$registry" --quiet
  log "Building and pushing unique release image $image_reference"
  docker buildx build --platform linux/amd64 --push \
    --build-arg VITE_API_BASE_URL=/api \
    --build-arg "VITE_CF_TURNSTILE_SITE_KEY=$site_key" \
    --build-arg "VITE_GOOGLE_CLIENT_ID=$google_client_id" \
    --build-arg "VITE_LIFF_ID=$liff_id" \
    --metadata-file "$metadata_file" \
    --tag "$image_reference" "$ROOT_DIR"
  digest="$(jq -r '."containerimage.digest" // empty' "$metadata_file")"
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || die "Docker did not return a valid pushed image digest"
  IMAGE_URI="$registry/$PROJECT_ID/$ARTIFACT_REPOSITORY/$SERVICE@$digest"
  export IMAGE_URI
  log "Pinned deployment image to digest $digest"
}

run_sql_migrations() {
  [[ "${RUN_SQL_MIGRATIONS:-false}" == "true" ]] || return 0
  [[ "${SQL_ENABLED:-false}" == "true" ]] || die "RUN_SQL_MIGRATIONS=true requires SQL_ENABLED=true"
  local migration_env="$RELEASE_DIR/migration-$DEPLOY_ENVIRONMENT.yaml"
  MIGRATION_MODE=true RUNTIME_ENV_FILE="$migration_env" RELEASE_ID="$RELEASE_ID" \
    node "$ROOT_DIR/scripts/render-runtime-env.js" "$DEPLOY_ENVIRONMENT" >/dev/null
  chmod 600 "$migration_env"
  log "Applying additive SQL migrations before traffic promotion"
  gcloud run jobs deploy "$SERVICE-migrate" \
    --project "$PROJECT_ID" --region "$REGION" --image "$IMAGE_URI" \
    --service-account "$MIGRATION_SERVICE_ACCOUNT_EMAIL" \
    --env-vars-file "$migration_env" \
    --command node --args backend/src/scripts/migrateSqlSchema.js,--apply \
    --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 900s \
    --cpu 1 --memory 512Mi --labels "application=psevent,environment=$DEPLOY_ENVIRONMENT" \
    --wait --quiet
}

service_json() {
  gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format json
}

smoke_test() {
  local origin="$1"
  local expected_release="$2"
  local live_file="$RELEASE_DIR/live.json"
  local ready_file="$RELEASE_DIR/ready.json"
  curl --fail --silent --show-error --location \
    --retry 10 --retry-delay 3 --retry-all-errors --max-time 20 \
    "$origin/health/live" --output "$live_file"
  EXPECTED_RELEASE="$expected_release" node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (value.status !== "ok" || value.release !== process.env.EXPECTED_RELEASE) process.exit(1);
  ' "$live_file" || return 1
  curl --fail --silent --show-error --location \
    --retry 10 --retry-delay 3 --retry-all-errors --max-time 20 \
    "$origin/health/ready" --output "$ready_file"
  node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (value.ready !== true || value.status !== "ready") process.exit(1);
  ' "$ready_file" || return 1
  curl --fail --silent --show-error --location --max-time 20 "$origin/" \
    | grep -Eiq '<!doctype html|<html' || return 1
}

remove_candidate_tag() {
  local tag="$1"
  gcloud run services update-traffic "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
    --remove-tags "$tag" --quiet >/dev/null 2>&1 || true
}

rollback_revision() {
  local revision="$1"
  [[ -n "$revision" ]] || die "Rollback revision is required"
  gcloud run revisions describe "$revision" --project "$PROJECT_ID" --region "$REGION" \
    --format='value(metadata.name)' >/dev/null
  log "Routing 100% traffic back to $revision"
  gcloud run services update-traffic "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
    --to-revisions "$revision=100" --quiet
}

deploy_release() {
  resolve_project
  require_command curl
  require_command jq
  require_command node
  ensure_clean_release_source
  if [[ "${SKIP_QUALITY_GATE:-false}" != "true" ]]; then quality_gate; fi
  gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1 \
    || die "Cloud Run service shell is missing. Run BOOTSTRAP_GCP=true ./scripts/release.sh bootstrap $DEPLOY_ENVIRONMENT first."

  RELEASE_ID="$(release_id)"
  export RELEASE_ID
  mkdir -p "$RELEASE_DIR"
  chmod 700 "$RELEASE_DIR"
  render_runtime_env
  build_and_push
  run_sql_migrations

  local before_json previous_revision short_id rollout_id candidate_tag revision_suffix runtime_env
  before_json="$(service_json)"
  previous_revision="$(printf '%s' "$before_json" | jq -r '[.status.traffic[]? | select((.percent // 0) == 100) | .revisionName][0] // empty')"
  [[ -n "$previous_revision" ]] || die "Deployment requires one revision serving 100% traffic before rollout"
  short_id="${RELEASE_ID:0:10}"
  rollout_id="${GITHUB_RUN_ID:-$(date -u +%s)}${GITHUB_RUN_ATTEMPT:-1}"
  rollout_id="$(printf '%s' "$rollout_id" | tr -cd '0-9' | tail -c 9)"
  candidate_tag="candidate-${short_id:0:7}-$rollout_id"
  revision_suffix="r${short_id:0:7}-$rollout_id"
  runtime_env="$RELEASE_DIR/runtime-$DEPLOY_ENVIRONMENT.yaml"

  log "Deploying candidate revision without production traffic"
  if ! gcloud run deploy "$SERVICE" \
    --project "$PROJECT_ID" --region "$REGION" --image "$IMAGE_URI" \
    --service-account "$RUNTIME_SERVICE_ACCOUNT_EMAIL" \
    --env-vars-file "$runtime_env" --port 8080 \
    --cpu "$CPU" --memory "$MEMORY" --min-instances "$MIN_INSTANCES" --max-instances "$MAX_INSTANCES" \
    --concurrency "$CONCURRENCY" --timeout "$REQUEST_TIMEOUT" --execution-environment gen2 \
    --startup-probe "httpGet.path=/health/live,httpGet.port=8080,timeoutSeconds=3,periodSeconds=3,failureThreshold=30" \
    --liveness-probe "httpGet.path=/health/live,httpGet.port=8080,timeoutSeconds=3,periodSeconds=30,failureThreshold=3" \
    --revision-suffix "$revision_suffix" --no-traffic --tag "$candidate_tag" \
    --labels "application=psevent,environment=$DEPLOY_ENVIRONMENT,release=${short_id}" --quiet; then
    remove_candidate_tag "$candidate_tag"
    die "Candidate deployment failed; existing traffic was not changed"
  fi

  local after_json new_revision candidate_url service_url
  after_json="$(service_json)"
  new_revision="$(printf '%s' "$after_json" | jq -r '.status.latestCreatedRevisionName // empty')"
  candidate_url="$(printf '%s' "$after_json" | jq -r --arg tag "$candidate_tag" '[.status.traffic[]? | select(.tag == $tag) | .url][0] // empty')"
  service_url="$(printf '%s' "$after_json" | jq -r '.status.url // empty')"
  [[ -n "$new_revision" && -n "$candidate_url" && -n "$service_url" ]] \
    || die "Unable to resolve candidate revision URLs"

  log "Running candidate liveness, dependency readiness, and SPA smoke tests"
  if ! smoke_test "$candidate_url" "$RELEASE_ID"; then
    remove_candidate_tag "$candidate_tag"
    die "Candidate smoke test failed; existing traffic was not changed"
  fi

  log "Promoting $new_revision to 100% traffic"
  if ! gcloud run services update-traffic "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
    --to-revisions "$new_revision=100" --quiet; then
    rollback_revision "$previous_revision"
    remove_candidate_tag "$candidate_tag"
    die "Traffic promotion failed and rollback was requested"
  fi

  log "Running post-promotion smoke tests"
  if ! smoke_test "$service_url" "$RELEASE_ID"; then
    rollback_revision "$previous_revision"
    remove_candidate_tag "$candidate_tag"
    die "Post-promotion smoke test failed; traffic was rolled back to $previous_revision"
  fi
  remove_candidate_tag "$candidate_tag"
  log "Deployment completed: $service_url ($new_revision)"
}

rollback_command() {
  resolve_project
  local requested="${3:-${ROLLBACK_REVISION:-}}"
  if [[ -z "$requested" ]]; then
    local current
    current="$(service_json | jq -r '[.status.traffic[]? | select((.percent // 0) == 100) | .revisionName][0] // empty')"
    requested="$(gcloud run revisions list --service "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
      --filter 'status.conditions.type=Ready AND status.conditions.status=True' \
      --sort-by '~metadata.creationTimestamp' --format 'value(metadata.name)' \
      | awk -v current="$current" '$0 != current { print; exit }')"
  fi
  rollback_revision "$requested"
  local service_url
  service_url="$(service_json | jq -r '.status.url')"
  curl --fail --silent --show-error --retry 5 --retry-all-errors "$service_url/health/ready" >/dev/null
  log "Rollback smoke test passed"
}

plan_release() {
  resolve_project
  local pins="$ROOT_DIR/deploy/secret-versions/$DEPLOY_ENVIRONMENT.json"
  local pin_count=0
  [[ -f "$pins" ]] && pin_count="$(jq 'length' "$pins")"
  printf 'Environment: %s\nProject: %s (%s)\nRegion: %s\nService: %s\nOrigin: %s\nRepository: %s\nRuntime SA: %s\nGCS bucket: %s\nPinned secrets: %s\n' \
    "$DEPLOY_ENVIRONMENT" "$PROJECT_ID" "$PROJECT_NUMBER" "$REGION" "$SERVICE" "$APP_ORIGIN" \
    "$ARTIFACT_REPOSITORY" "$RUNTIME_SERVICE_ACCOUNT_EMAIL" "$GCS_BUCKET" "$pin_count"
  if ! RELEASE_ID="$(release_id)" node "$ROOT_DIR/scripts/render-runtime-env.js" "$DEPLOY_ENVIRONMENT" >/dev/null 2>&1; then
    log "Deploy readiness: BLOCKED until required secret versions are synchronized"
  else
    log "Deploy readiness: configuration and secret pins are valid"
  fi
}

usage() {
  cat <<'USAGE'
Usage: ./scripts/release.sh COMMAND [staging|production] [revision]

Commands:
  ci          Install locked dependencies, test, lint, audit, and optionally build Docker.
  plan        Show the non-secret deployment plan and readiness blockers.
  bootstrap   Provision keyless Google Cloud IAM, Artifact Registry, GCS, and service shell.
  secrets     Create/pin Secret Manager versions; requires ALLOW_SECRET_UPLOAD=true.
  deploy      Run quality gates, build/push, migrate if enabled, canary, promote, and smoke test.
  rollback    Route traffic to an explicit revision or the previous ready revision.
  all         Run CI, bootstrap, optional secret sync, and deploy through this one entrypoint.

First staging deployment:
  BOOTSTRAP_GCP=true ALLOW_SECRET_UPLOAD=true SYNC_SECRETS=true LOAD_LOCAL_DEPLOY_CONFIG=true \
    ./scripts/release.sh all staging
USAGE
}

load_config
load_local_nonsecret_config
case "$COMMAND" in
  ci)
    quality_gate
    ;;
  plan)
    plan_release
    ;;
  bootstrap)
    bootstrap_gcp
    ;;
  secrets)
    sync_secrets
    ;;
  deploy)
    deploy_release
    ;;
  rollback)
    require_command jq
    rollback_command "$@"
    ;;
  all)
    quality_gate
    bootstrap_gcp
    if [[ "${SYNC_SECRETS:-false}" == "true" ]]; then
      [[ "$DEPLOY_ENVIRONMENT" != "production" ]] \
        || die "Production Secret pins must be synchronized, reviewed, and committed before deployment"
      export SECRET_VERSIONS_FILE="$RELEASE_DIR/secret-versions-$DEPLOY_ENVIRONMENT.json"
      sync_secrets
      log "Staging used temporary Secret pins. Run the secrets command separately and commit reviewed pin metadata for GitHub CD."
    fi
    SKIP_QUALITY_GATE=true deploy_release
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    die "Unknown command: $COMMAND"
    ;;
esac
