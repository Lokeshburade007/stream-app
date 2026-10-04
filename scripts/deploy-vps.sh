#!/usr/bin/env bash
# Run from your development computer. The VPS keeps its secrets and media.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-lokesh007}"
REMOTE_DIR="${STREAMHUB_REMOTE_DIR:-/home/ubuntu/stream-app}"

for command in rsync ssh; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  }
done

printf 'Syncing application source to %s:%s\n' "$TARGET" "$REMOTE_DIR"
rsync -az \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'server/.env' \
  --exclude 'server/private.pem' \
  --exclude 'server/public.pem' \
  --exclude 'server/media/' \
  "$ROOT_DIR/" "$TARGET:$REMOTE_DIR/"

printf 'Building and restarting services on %s\n' "$TARGET"
ssh "$TARGET" "cd '$REMOTE_DIR' && bash deploy.sh"
