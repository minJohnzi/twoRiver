#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_PROJECT_DIR="/home/twoRiver"
DEFAULT_API_SERVICE="tworiver-api"
DEFAULT_NGINX_SITE="tworiver"
DEFAULT_API_PORT="4000"
DEFAULT_SERVICE_USER="tworiver"
DEFAULT_ADMIN_USERNAME="admin"
DEFAULT_DEEPSEEK_BASE_URL="https://api.deepseek.com"

PROJECT_DIR=""
ENV_FILE=""
DOMAIN=""
USE_WWW="yes"
ENABLE_HTTPS="no"
API_SERVICE="$DEFAULT_API_SERVICE"
NGINX_SITE="$DEFAULT_NGINX_SITE"
API_PORT="$DEFAULT_API_PORT"
SERVICE_USER="$DEFAULT_SERVICE_USER"
ADMIN_USERNAME="$DEFAULT_ADMIN_USERNAME"
ADMIN_PASSWORD=""
SESSION_SECRET=""
DEEPSEEK_API_KEY=""
DEEPSEEK_BASE_URL="$DEFAULT_DEEPSEEK_BASE_URL"
PNPM_BIN=""
PUBLIC_SCHEME="http"

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

prompt() {
  local var_name="$1"
  local label="$2"
  local default_value="${3:-}"
  local input

  if [[ -n "$default_value" ]]; then
    read -r -p "$label [$default_value]: " input
    printf -v "$var_name" '%s' "${input:-$default_value}"
  else
    while true; do
      read -r -p "$label: " input
      if [[ -n "$input" ]]; then
        printf -v "$var_name" '%s' "$input"
        return
      fi
      warn "This value is required."
    done
  fi
}

prompt_secret() {
  local var_name="$1"
  local label="$2"
  local min_length="$3"
  local input confirm

  while true; do
    read -r -s -p "$label: " input
    printf '\n'
    read -r -s -p "Confirm $label: " confirm
    printf '\n'

    if [[ "$input" != "$confirm" ]]; then
      warn "Values do not match."
      continue
    fi

    if (( ${#input} < min_length )); then
      warn "Value must contain at least $min_length characters."
      continue
    fi

    if [[ "$input" == *$'\n'* || "$input" == *$'\r'* ]]; then
      warn "Value cannot contain newlines."
      continue
    fi

    printf -v "$var_name" '%s' "$input"
    return
  done
}

prompt_yes_no() {
  local var_name="$1"
  local label="$2"
  local default_value="$3"
  local input

  while true; do
    read -r -p "$label [$default_value]: " input
    input="${input:-$default_value}"
    case "${input,,}" in
      y|yes)
        printf -v "$var_name" "yes"
        return
        ;;
      n|no)
        printf -v "$var_name" "no"
        return
        ;;
      *)
        warn "Please answer yes or no."
        ;;
    esac
  done
}

env_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

backup_file() {
  local file_path="$1"
  local timestamp

  if [[ -e "$file_path" || -L "$file_path" ]]; then
    timestamp="$(date +%Y%m%d-%H%M%S)"
    cp -a "$file_path" "$file_path.bak.$timestamp"
    log "Backed up $file_path to $file_path.bak.$timestamp"
  fi
}

require_root_for_system_files() {
  if [[ "$(id -u)" -ne 0 ]]; then
    fail "Please run this script as root because it writes systemd and Nginx config."
  fi
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null || fail "$command_name not found. Install it first, then rerun this script."
}

detect_pnpm() {
  if [[ -n "$PNPM_BIN" ]]; then
    [[ -x "$PNPM_BIN" ]] || fail "Configured pnpm path is not executable: $PNPM_BIN"
    return
  fi

  PNPM_BIN="$(command -v pnpm || true)"
  [[ -n "$PNPM_BIN" ]] || fail "pnpm not found. Install pnpm first."
}

collect_inputs() {
  log "TwoRiver Blog deployment setup"

  prompt PROJECT_DIR "Project directory" "$DEFAULT_PROJECT_DIR"
  ENV_FILE="$PROJECT_DIR/.env"

  prompt DOMAIN "Primary domain, for example mjzi.me"
  prompt_yes_no USE_WWW "Also configure www.$DOMAIN" "yes"
  prompt_yes_no ENABLE_HTTPS "Run Certbot and enable HTTPS now" "no"
  prompt API_SERVICE "systemd API service name" "$DEFAULT_API_SERVICE"
  prompt NGINX_SITE "Nginx site name" "$DEFAULT_NGINX_SITE"
  prompt API_PORT "API port" "$DEFAULT_API_PORT"
  prompt SERVICE_USER "system user for the API service" "$DEFAULT_SERVICE_USER"
  prompt ADMIN_USERNAME "Admin username" "$DEFAULT_ADMIN_USERNAME"
  prompt_secret ADMIN_PASSWORD "Admin password, at least 12 chars" 12

  if [[ -z "$SESSION_SECRET" ]]; then
    if command -v openssl >/dev/null; then
      SESSION_SECRET="$(openssl rand -hex 32)"
    else
      prompt_secret SESSION_SECRET "Session secret, at least 32 chars" 32
    fi
  fi

  read -r -p "DeepSeek API key, optional: " DEEPSEEK_API_KEY
  prompt DEEPSEEK_BASE_URL "DeepSeek base URL" "$DEFAULT_DEEPSEEK_BASE_URL"

  detect_pnpm
  prompt PNPM_BIN "pnpm path" "$PNPM_BIN"

  if [[ "$ENABLE_HTTPS" == "yes" ]]; then
    PUBLIC_SCHEME="https"
  fi
}

validate_inputs() {
  [[ -d "$PROJECT_DIR" ]] || fail "Project directory not found: $PROJECT_DIR"
  [[ -f "$PROJECT_DIR/package.json" ]] || fail "package.json not found in $PROJECT_DIR"
  [[ "$API_PORT" =~ ^[0-9]+$ ]] || fail "API port must be a number."
  [[ "$SERVICE_USER" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]] || fail "Service user must be a valid system user name."
  [[ ${#ADMIN_PASSWORD} -ge 12 ]] || fail "Admin password must contain at least 12 characters."
  [[ ${#SESSION_SECRET} -ge 32 ]] || fail "Session secret must contain at least 32 characters."
}

ensure_service_user() {
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    return
  fi

  log "Creating system user $SERVICE_USER"
  useradd --system --home "$PROJECT_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
}

write_env_file() {
  local origins

  origins="$PUBLIC_SCHEME://$DOMAIN"
  if [[ "$USE_WWW" == "yes" ]]; then
    origins="$origins,$PUBLIC_SCHEME://www.$DOMAIN"
  fi

  backup_file "$ENV_FILE"

  log "Writing $ENV_FILE"
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=$API_PORT
DATABASE_PATH=$PROJECT_DIR/apps/api/data/blog.sqlite
SESSION_SECRET=$(env_quote "$SESSION_SECRET")
ADMIN_USERNAME=$(env_quote "$ADMIN_USERNAME")
ADMIN_PASSWORD=$(env_quote "$ADMIN_PASSWORD")
DEEPSEEK_API_KEY=$(env_quote "$DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL=$(env_quote "$DEEPSEEK_BASE_URL")
CORS_ALLOWED_ORIGINS=$origins
EOF

  chmod 600 "$ENV_FILE"
}

load_env_file() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

install_and_build() {
  cd "$PROJECT_DIR"

  log "Installing dependencies"
  env CI=true "$PNPM_BIN" install --frozen-lockfile --prod=false

  log "Building project"
  "$PNPM_BIN" build

  load_env_file
  ensure_service_user
  mkdir -p "$PROJECT_DIR/apps/api/data"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$PROJECT_DIR/apps/api/data"

  log "Running database migration"
  runuser -u "$SERVICE_USER" -- env DATABASE_PATH="$DATABASE_PATH" "$PNPM_BIN" --filter @tworiver/api migrate

  log "Seeding admin user"
  runuser -u "$SERVICE_USER" -- env \
    DATABASE_PATH="$DATABASE_PATH" \
    ADMIN_USERNAME="$ADMIN_USERNAME" \
    ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    "$PNPM_BIN" --filter @tworiver/api seed:admin
}

write_systemd_service() {
  local service_file="/etc/systemd/system/$API_SERVICE.service"

  backup_file "$service_file"

  log "Writing $service_file"
  cat > "$service_file" <<EOF
[Unit]
Description=TwoRiver Blog API
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$PNPM_BIN --filter @tworiver/api start
Restart=always
RestartSec=5
User=$SERVICE_USER
Group=$SERVICE_USER
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$API_SERVICE"
  systemctl restart "$API_SERVICE"
  systemctl status "$API_SERVICE" --no-pager
}

write_nginx_site() {
  local site_file="/etc/nginx/sites-available/$NGINX_SITE"
  local enabled_file="/etc/nginx/sites-enabled/$NGINX_SITE"
  local server_names="$DOMAIN"

  if [[ "$USE_WWW" == "yes" ]]; then
    server_names="$server_names www.$DOMAIN"
  fi

  backup_file "$site_file"

  log "Writing $site_file"
  cat > "$site_file" <<EOF
server {
    listen 80;
    server_name $server_names;
    client_max_body_size 5m;

    root $PROJECT_DIR/apps/web/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:$API_PORT/api/;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        alias $PROJECT_DIR/apps/api/data/uploads/;
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

  if [[ ! -L "$enabled_file" ]]; then
    ln -s "$site_file" "$enabled_file"
  fi

  if [[ -L /etc/nginx/sites-enabled/default ]]; then
    backup_file /etc/nginx/sites-enabled/default
    rm /etc/nginx/sites-enabled/default
  fi

  nginx -t
  systemctl reload nginx
}

enable_https_if_requested() {
  local certbot_args=(--nginx -d "$DOMAIN")

  if [[ "$ENABLE_HTTPS" != "yes" ]]; then
    return
  fi

  require_command certbot

  if [[ "$USE_WWW" == "yes" ]]; then
    certbot_args+=(-d "www.$DOMAIN")
  fi

  log "Running Certbot"
  certbot "${certbot_args[@]}"

  PUBLIC_SCHEME="https"
  write_env_file
  load_env_file
  systemctl restart "$API_SERVICE"
}

verify_deployment() {
  local public_url="$PUBLIC_SCHEME://$DOMAIN"

  if [[ "$USE_WWW" == "yes" ]]; then
    public_url="$PUBLIC_SCHEME://www.$DOMAIN"
  fi

  log "Verifying local API"
  curl -fsS "http://127.0.0.1:$API_PORT/api/health"

  log "Verifying Nginx API proxy"
  curl -fsS "http://127.0.0.1/api/health"

  log "Verifying public URL: $public_url"
  curl -fsSI "$public_url"
  curl -fsS "$public_url/api/health"
}

print_summary() {
  local public_url="$PUBLIC_SCHEME://$DOMAIN"

  if [[ "$USE_WWW" == "yes" ]]; then
    public_url="$PUBLIC_SCHEME://www.$DOMAIN"
  fi

  cat <<EOF

Deployment setup completed.

Project:      $PROJECT_DIR
Env file:     $ENV_FILE
API service:  $API_SERVICE
Service user: $SERVICE_USER
Nginx site:   $NGINX_SITE
Public URL:   $public_url

Next update:
  cd $PROJECT_DIR
  bash scripts/deploy-update.sh --url $public_url
EOF
}

main() {
  require_root_for_system_files
  require_command git
  require_command curl
  require_command nginx
  require_command systemctl
  require_command useradd
  require_command chown
  require_command runuser

  collect_inputs
  validate_inputs
  write_env_file
  install_and_build
  write_systemd_service
  write_nginx_site
  enable_https_if_requested
  verify_deployment
  print_summary
}

main "$@"
