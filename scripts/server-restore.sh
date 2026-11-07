#!/bin/bash
#
# Replace this server's database and cheque images with a backup.
#
#   bash scripts/server-restore.sh                  # list what can be restored
#   bash scripts/server-restore.sh latest --confirm # restore the newest
#   bash scripts/server-restore.sh <id> --confirm   # restore that snapshot
#
# Everything currently on the server is overwritten. FIELD_ENCRYPTION_KEY in
# infrastructure/.env.production must be the one in use when the backup was
# taken, or account numbers cannot be read. The other secrets can be new.
#
set -euo pipefail

cd "$(dirname "$0")/.."

RESTIC_IMAGE=restic/restic:0.18.1
BACKUP_ENV=infrastructure/.env.backup
APP_ENV=infrastructure/.env.production
COMPOSE=(docker compose --env-file "$APP_ENV" -f infrastructure/docker-compose.prod.yml)

for file in "$BACKUP_ENV" "$APP_ENV"; do
  [ -f "$file" ] || { echo "Missing $file" >&2; exit 1; }
done

setting() { sed -n "s/^$1=//p" "$2" | head -n 1; }

REPOSITORY=$(setting RESTIC_REPOSITORY "$BACKUP_ENV")
# The same fallbacks the compose file uses for these two.
POSTGRES_USER=$(setting POSTGRES_USER "$APP_ENV")
POSTGRES_USER=${POSTGRES_USER:-chequeflow}
POSTGRES_DB=$(setting POSTGRES_DB "$APP_ENV")
POSTGRES_DB=${POSTGRES_DB:-chequeflow}

REPOSITORY_MOUNT=()
case "$REPOSITORY" in
  /*) REPOSITORY_MOUNT=(-v "$REPOSITORY:$REPOSITORY") ;;
esac

RESTIC_MOUNTS=()
restic() {
  docker run --rm --hostname chequeflow --env-file "$BACKUP_ENV" \
    "${REPOSITORY_MOUNT[@]}" "${RESTIC_MOUNTS[@]}" "$RESTIC_IMAGE" "$@"
}

if [ $# -eq 0 ]; then
  restic snapshots
  exit 0
fi

SNAPSHOT=$1
if [ "${2:-}" != "--confirm" ]; then
  echo "This overwrites the database and images on this server." >&2
  echo "Run again with: $SNAPSHOT --confirm" >&2
  exit 1
fi

WORK=$(mktemp -d /root/chequeflow-restore.XXXXXX)
trap 'rm -rf "${WORK:?}"' EXIT
chmod 700 "$WORK"

# Fetch the dump before anything is stopped or emptied: a wrong password or an
# unreachable repository must leave the running system as it was.
RESTIC_MOUNTS=(-v "$WORK:/restore")
restic restore "$SNAPSHOT" --target /restore --include /backup/db

# Creates the volumes on a new server, without starting anything.
"${COMPOSE[@]}" up --no-start
"${COMPOSE[@]}" stop proxy web api storage
"${COMPOSE[@]}" up -d --wait postgres

docker run --rm --entrypoint sh -v chequeflow_storage-data:/backup/storage "$RESTIC_IMAGE" \
  -c 'find /backup/storage -mindepth 1 -delete'
RESTIC_MOUNTS=(-v chequeflow_storage-data:/backup/storage)
restic restore "$SNAPSHOT" --target / --include /backup/storage

"${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)" \
  -c "CREATE DATABASE \"$POSTGRES_DB\""
"${COMPOSE[@]}" exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-owner --exit-on-error <"$WORK/backup/db/db.dump"

"${COMPOSE[@]}" up -d

echo "Restored $SNAPSHOT. Sign in and open a cheque image to confirm."
