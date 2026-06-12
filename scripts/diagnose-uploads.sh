#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-}"
ENV_FILE="${ENV_FILE:-}"
API_SERVICE="${API_SERVICE:-tworiver-api}"
NGINX_SITE="${NGINX_SITE:-tworiver}"

usage() {
  cat <<'EOF'
Usage: scripts/diagnose-uploads.sh [options]

Read-only upload diagnostics for a deployed TwoRiver server.

Options:
  --project-dir PATH   Project directory. Defaults to this script's parent directory.
  --env-file PATH      Environment file. Defaults to PROJECT_DIR/.env.
  --service NAME       systemd API service name. Defaults to tworiver-api.
  --nginx-site NAME    Nginx site name. Defaults to tworiver.
  -h, --help           Show this help.

Environment overrides:
  PROJECT_DIR=/home/twoRiver
  ENV_FILE=/home/twoRiver/.env
  API_SERVICE=tworiver-api
  NGINX_SITE=tworiver
EOF
}

log() {
  printf '\n==> %s\n' "$*"
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --project-dir)
        [[ $# -ge 2 ]] || { warn "--project-dir requires a value"; exit 1; }
        PROJECT_DIR="$2"
        shift
        ;;
      --env-file)
        [[ $# -ge 2 ]] || { warn "--env-file requires a value"; exit 1; }
        ENV_FILE="$2"
        shift
        ;;
      --service)
        [[ $# -ge 2 ]] || { warn "--service requires a value"; exit 1; }
        API_SERVICE="$2"
        shift
        ;;
      --nginx-site)
        [[ $# -ge 2 ]] || { warn "--nginx-site requires a value"; exit 1; }
        NGINX_SITE="$2"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        warn "Unknown option: $1"
        usage
        exit 1
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
}

load_environment() {
  if [[ ! -f "$ENV_FILE" ]]; then
    warn "Environment file not found: $ENV_FILE"
    return
  fi

  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

show_config() {
  local api_port="${PORT:-4000}"
  local database_path="${DATABASE_PATH:-}"
  local uploads_root=""

  if [[ -n "$database_path" ]]; then
    uploads_root="$(cd "$(dirname "$database_path")" 2>/dev/null && pwd || true)/uploads"
  fi

  log "Resolved deployment settings"
  printf 'Project dir:    %s\n' "$PROJECT_DIR"
  printf 'Env file:       %s\n' "$ENV_FILE"
  printf 'API service:    %s\n' "$API_SERVICE"
  printf 'API port:       %s\n' "$api_port"
  printf 'Database path:  %s\n' "${database_path:-<unset>}"
  printf 'Uploads root:   %s\n' "${uploads_root:-<unknown>}"
  printf 'CORS origins:   %s\n' "${CORS_ALLOWED_ORIGINS:-<unset>}"
}

check_api() {
  local api_port="${PORT:-4000}"

  log "API health"
  if command -v curl >/dev/null; then
    curl -fsS "http://127.0.0.1:$api_port/api/health" || warn "Local API health check failed."
  else
    warn "curl not found; skipping API health check."
  fi
}

check_uploads_directory() {
  local database_path="${DATABASE_PATH:-}"

  log "Uploads directory"
  if [[ -z "$database_path" ]]; then
    warn "DATABASE_PATH is not set."
    return
  fi

  local data_dir
  data_dir="$(dirname "$database_path")"
  local uploads_root="$data_dir/uploads"

  printf 'Data dir exists:      '
  [[ -d "$data_dir" ]] && printf 'yes\n' || printf 'no\n'
  printf 'Uploads root exists:  '
  [[ -d "$uploads_root" ]] && printf 'yes\n' || printf 'no\n'

  if [[ -d "$data_dir" ]]; then
    ls -ld "$data_dir" "$uploads_root" 2>/dev/null || true
  fi

  printf 'Writable by current user: '
  [[ -w "$uploads_root" ]] && printf 'yes\n' || printf 'no\n'
}

check_nginx() {
  local site_available="/etc/nginx/sites-available/$NGINX_SITE"
  local site_enabled="/etc/nginx/sites-enabled/$NGINX_SITE"

  log "Nginx configuration"
  if command -v nginx >/dev/null; then
    nginx -t || warn "nginx -t failed."
  else
    warn "nginx not found."
  fi

  printf 'Site available: %s\n' "$site_available"
  [[ -e "$site_available" ]] && sed -n '1,180p' "$site_available" || warn "Nginx site file not found."

  printf '\nSite enabled:   %s\n' "$site_enabled"
  [[ -e "$site_enabled" ]] && ls -l "$site_enabled" || warn "Nginx enabled site link not found."

  if [[ -e "$site_available" ]]; then
    printf '\nExpected upload directives:\n'
    grep -nE 'client_max_body_size|location /uploads/|alias .*uploads|proxy_pass' "$site_available" || true
  fi
}

show_logs() {
  log "Recent API logs"
  if command -v journalctl >/dev/null; then
    journalctl -u "$API_SERVICE" -n 80 --no-pager || warn "Could not read API journal."
  else
    warn "journalctl not found."
  fi

  log "Recent Nginx errors"
  if [[ -f /var/log/nginx/error.log ]]; then
    tail -n 80 /var/log/nginx/error.log
  else
    warn "Nginx error log not found."
  fi
}

main() {
  parse_args "$@"
  resolve_paths
  load_environment
  show_config
  check_api
  check_uploads_directory
  check_nginx
  show_logs
}

main "$@"
