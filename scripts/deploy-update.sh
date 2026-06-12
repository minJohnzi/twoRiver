#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-}"
ENV_FILE="${ENV_FILE:-}"
API_SERVICE="${API_SERVICE:-tworiver-api}"
PUBLIC_URL="${PUBLIC_URL:-}"

MODE="full"
DO_PULL=1
DO_INSTALL=1
DO_BUILD=1
DO_MIGRATE=1
DO_RESTART_API=1
DO_RELOAD_NGINX=1
DO_SEED_ADMIN=0
VERIFY=1
BACKUP=1
FORCE=0
DRY_RUN=0

BEFORE_COMMIT=""
AFTER_COMMIT=""
DATABASE_BACKUP=""
DIST_BACKUP=""

usage() {
  cat <<'EOF'
Usage: scripts/deploy-update.sh [options]

Default behavior:
  Pull latest code, skip deployment when there is no new commit, otherwise
  install dependencies, back up SQLite and dist, build, migrate, restart API,
  reload Nginx, and verify local/public health checks.

Options:
  --full               Full update. This is the default.
  --frontend-only      Pull, install, back up dist, build, reload Nginx; skip API migrate/restart.
  --api-only           Pull, install, build, back up SQLite, migrate, restart API; skip Nginx reload.
  --seed-admin         Load .env and run pnpm --filter @tworiver/api seed:admin.
  --force              Deploy even when git pull does not change the current commit.
  --dry-run            Print commands without executing them.
  --no-backup          Do not back up SQLite or apps/web/dist.
  --skip-pull          Do not run git pull.
  --skip-install       Do not run pnpm install --frozen-lockfile --prod=false.
  --skip-build         Do not run pnpm build.
  --skip-migrate       Do not run API migration.
  --no-api-restart     Do not restart the API systemd service.
  --no-nginx-reload    Do not reload Nginx.
  --no-verify          Do not run curl verification checks.
  --url URL            Public site URL to verify. Defaults to first CORS_ALLOWED_ORIGINS URL.
  --project-dir PATH   Project directory. Defaults to this script's parent directory.
  --env-file PATH      Environment file. Defaults to PROJECT_DIR/.env.
  --service NAME       systemd API service name. Defaults to tworiver-api.
  -h, --help           Show this help.

Examples:
  bash scripts/deploy-update.sh
  bash scripts/deploy-update.sh --force
  bash scripts/deploy-update.sh --frontend-only
  bash scripts/deploy-update.sh --api-only --url https://www.example.me
  bash scripts/deploy-update.sh --seed-admin --force
  bash scripts/deploy-update.sh --dry-run

Environment overrides:
  PROJECT_DIR=/home/twoRiver
  ENV_FILE=/home/twoRiver/.env
  API_SERVICE=tworiver-api
  PUBLIC_URL=https://www.example.me
EOF
}

log() {
  printf '\n==> %s\n' "$*"
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

run() {
  log "$*"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  "$@"
}

on_error() {
  local line_number="$1"
  local exit_code="$2"

  printf '\nERROR: deploy-update.sh failed at line %s with exit code %s.\n' "$line_number" "$exit_code" >&2
  printf '\nUseful diagnostics:\n' >&2
  printf '  systemctl status %s --no-pager\n' "$API_SERVICE" >&2
  printf '  journalctl -u %s -n 100 --no-pager\n' "$API_SERVICE" >&2
  printf '  nginx -t\n' >&2
  printf '  tail -n 100 /var/log/nginx/error.log\n' >&2

  if [[ -n "$DATABASE_BACKUP" ]]; then
    printf '\nDatabase backup created at:\n  %s\n' "$DATABASE_BACKUP" >&2
  fi

  if [[ -n "$DIST_BACKUP" ]]; then
    printf '\nFrontend dist backup created at:\n  %s\n' "$DIST_BACKUP" >&2
  fi
}

trap 'on_error "$LINENO" "$?"' ERR

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --full)
        MODE="full"
        ;;
      --frontend-only)
        MODE="frontend"
        DO_MIGRATE=0
        DO_RESTART_API=0
        ;;
      --api-only)
        MODE="api"
        DO_RELOAD_NGINX=0
        ;;
      --seed-admin)
        DO_SEED_ADMIN=1
        ;;
      --force)
        FORCE=1
        ;;
      --dry-run)
        DRY_RUN=1
        ;;
      --no-backup)
        BACKUP=0
        ;;
      --skip-pull)
        DO_PULL=0
        ;;
      --skip-install)
        DO_INSTALL=0
        ;;
      --skip-build)
        DO_BUILD=0
        ;;
      --skip-migrate)
        DO_MIGRATE=0
        ;;
      --no-api-restart)
        DO_RESTART_API=0
        ;;
      --no-nginx-reload)
        DO_RELOAD_NGINX=0
        ;;
      --no-verify)
        VERIFY=0
        ;;
      --url)
        [[ $# -ge 2 ]] || fail "--url requires a value"
        PUBLIC_URL="$2"
        shift
        ;;
      --project-dir)
        [[ $# -ge 2 ]] || fail "--project-dir requires a value"
        PROJECT_DIR="$2"
        shift
        ;;
      --env-file)
        [[ $# -ge 2 ]] || fail "--env-file requires a value"
        ENV_FILE="$2"
        shift
        ;;
      --service)
        [[ $# -ge 2 ]] || fail "--service requires a value"
        API_SERVICE="$2"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown option: $1"
        ;;
    esac
    shift
  done
}

resolve_paths() {
  if [[ -z "$PROJECT_DIR" ]]; then
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(cd "$script_dir/.." && pwd)"
  fi

  if [[ -z "$ENV_FILE" ]]; then
    ENV_FILE="$PROJECT_DIR/.env"
  fi

  [[ -d "$PROJECT_DIR" ]] || fail "Project directory not found: $PROJECT_DIR"
  [[ -f "$PROJECT_DIR/package.json" ]] || fail "package.json not found in $PROJECT_DIR"
  [[ -f "$ENV_FILE" ]] || fail "Environment file not found: $ENV_FILE"

  cd "$PROJECT_DIR"
}

load_environment() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  if [[ -z "$PUBLIC_URL" && -n "${CORS_ALLOWED_ORIGINS:-}" ]]; then
    PUBLIC_URL="${CORS_ALLOWED_ORIGINS%%,*}"
  fi
}

require_commands() {
  command -v git >/dev/null || fail "git not found"
  command -v pnpm >/dev/null || fail "pnpm not found"
  command -v systemctl >/dev/null || fail "systemctl not found"
  command -v curl >/dev/null || fail "curl not found"

  if [[ "$DO_RELOAD_NGINX" -eq 1 ]]; then
    command -v nginx >/dev/null || fail "nginx not found"
  fi
}

print_summary() {
  log "Configuration"
  printf 'Project:      %s\n' "$PROJECT_DIR"
  printf 'Env file:     %s\n' "$ENV_FILE"
  printf 'Mode:         %s\n' "$MODE"
  printf 'API service:  %s\n' "$API_SERVICE"
  printf 'Public URL:   %s\n' "${PUBLIC_URL:-<not set>}"
  printf 'Force:        %s\n' "$FORCE"
  printf 'Dry run:      %s\n' "$DRY_RUN"
}

git_update() {
  BEFORE_COMMIT="$(git rev-parse HEAD)"

  if [[ "$DO_PULL" -eq 1 ]]; then
    run git pull
  else
    warn "Skipping git pull."
  fi

  AFTER_COMMIT="$(git rev-parse HEAD)"

  log "Git revision"
  printf 'Before: %s\n' "$BEFORE_COMMIT"
  printf 'After:  %s\n' "$AFTER_COMMIT"

  if [[ "$BEFORE_COMMIT" == "$AFTER_COMMIT" && "$FORCE" -ne 1 ]]; then
    log "No new commit detected. Skipping deployment. Use --force to deploy anyway."
    exit 0
  fi
}

timestamp() {
  date +%Y%m%d-%H%M%S
}

backup_database() {
  if [[ "$BACKUP" -ne 1 || "$DO_MIGRATE" -ne 1 ]]; then
    return
  fi

  if [[ -z "${DATABASE_PATH:-}" ]]; then
    warn "DATABASE_PATH is not set; skipping database backup."
    return
  fi

  if [[ ! -f "$DATABASE_PATH" ]]; then
    warn "Database file not found at $DATABASE_PATH; skipping database backup."
    return
  fi

  DATABASE_BACKUP="$DATABASE_PATH.bak.$(timestamp)"
  run cp -a "$DATABASE_PATH" "$DATABASE_BACKUP"
}

backup_dist() {
  local dist_dir="$PROJECT_DIR/apps/web/dist"

  if [[ "$BACKUP" -ne 1 || "$DO_BUILD" -ne 1 || "$MODE" == "api" ]]; then
    return
  fi

  if [[ ! -d "$dist_dir" ]]; then
    warn "Frontend dist directory not found at $dist_dir; skipping dist backup."
    return
  fi

  DIST_BACKUP="$dist_dir.bak.$(timestamp)"
  run cp -a "$dist_dir" "$DIST_BACKUP"
}

install_dependencies() {
  if [[ "$DO_INSTALL" -eq 1 ]]; then
    run env CI=true pnpm install --frozen-lockfile --prod=false
  fi
}

build_project() {
  if [[ "$DO_BUILD" -eq 1 ]]; then
    run pnpm build
  fi
}

migrate_database() {
  if [[ "$DO_MIGRATE" -eq 1 ]]; then
    run pnpm --filter @tworiver/api migrate
  fi
}

seed_admin() {
  if [[ "$DO_SEED_ADMIN" -eq 1 ]]; then
    run pnpm --filter @tworiver/api seed:admin
  fi
}

restart_api() {
  if [[ "$DO_RESTART_API" -eq 1 ]]; then
    run systemctl restart "$API_SERVICE"
  fi
}

reload_nginx() {
  if [[ "$DO_RELOAD_NGINX" -eq 1 ]]; then
    run nginx -t
    run systemctl reload nginx
  fi
}

verify_deployment() {
  local api_port="${PORT:-4000}"

  if [[ "$VERIFY" -ne 1 ]]; then
    return
  fi

  if [[ "$DO_RESTART_API" -eq 1 || "$DO_MIGRATE" -eq 1 || "$MODE" != "frontend" ]]; then
    run curl -fsS "http://127.0.0.1:$api_port/api/health"
  fi

  if [[ -n "$PUBLIC_URL" ]]; then
    PUBLIC_URL="${PUBLIC_URL%/}"
    run curl -fsSI "$PUBLIC_URL"
    run curl -fsS "$PUBLIC_URL/api/health"
  else
    warn "PUBLIC_URL is not set and could not be inferred; skipping public verification."
  fi

  if [[ "$DO_RESTART_API" -eq 1 ]]; then
    run systemctl status "$API_SERVICE" --no-pager
  fi
}

print_success() {
  log "Deployment update completed."

  if [[ -n "$DATABASE_BACKUP" ]]; then
    printf 'Database backup: %s\n' "$DATABASE_BACKUP"
  fi

  if [[ -n "$DIST_BACKUP" ]]; then
    printf 'Frontend backup: %s\n' "$DIST_BACKUP"
  fi
}

main() {
  parse_args "$@"
  resolve_paths
  load_environment
  require_commands
  print_summary
  git_update
  install_dependencies
  backup_database
  backup_dist
  build_project
  migrate_database
  seed_admin
  restart_api
  reload_nginx
  verify_deployment
  print_success
}

main "$@"
