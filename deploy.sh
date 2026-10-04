#!/usr/bin/env bash
# Run this on the VPS from any directory: bash /home/ubuntu/stream-app/deploy.sh
# It never replaces server/.env, PEM keys, or server/media.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
CLIENT_DIR="$ROOT_DIR/client"
HEALTH_PORT="${HEALTH_PORT:-5001}"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nDeployment failed at line %s.\n' "$1" >&2; }
trap 'fail "$LINENO"' ERR

for command in node npm pm2 curl; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  }
done

for required_file in "$SERVER_DIR/.env" "$SERVER_DIR/private.pem" "$SERVER_DIR/public.pem" "$SERVER_DIR/package-lock.json" "$CLIENT_DIR/package-lock.json"; do
  [[ -f "$required_file" ]] || {
    printf 'Missing required deployment file: %s\n' "$required_file" >&2
    exit 1
  }
done

log "Creating persistent media directories"
mkdir -p "$SERVER_DIR/media/uploads" "$SERVER_DIR/media/hls"

log "Installing backend production dependencies"
(cd "$SERVER_DIR" && npm ci --omit=dev)

log "Installing frontend dependencies"
(cd "$CLIENT_DIR" && npm ci)

log "Building the Next.js frontend"
(cd "$CLIENT_DIR" && npm run build)

log "Reloading backend and frontend with PM2"
pm2 startOrReload "$ROOT_DIR/ecosystem.config.cjs" --update-env
pm2 save

log "Checking backend health"
for attempt in 1 2 3 4 5; do
  if curl --fail --silent --show-error "http://127.0.0.1:${HEALTH_PORT}/health"; then
    printf '\nDeployment complete.\n'
    pm2 status
    exit 0
  fi
  sleep 2
done

printf 'Backend health check did not pass. Inspect with: pm2 logs stream-server --lines 100\n' >&2
exit 1
