#!/bin/bash
#
# Back up a production server: the database and the cheque images, encrypted
# before they leave the machine. Run daily from cron; docs/deployment.md has
# the setup. Restore with scripts/server-restore.sh.
#
# Settings come from infrastructure/.env.backup (see its .example).
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

# Read one value without sourcing a file full of secrets into this shell.
setting() { sed -n "s/^$1=//p" "$2" | head -n 1; }

REPOSITORY=$(setting RESTIC_REPOSITORY "$BACKUP_ENV")
PING_URL=$(setting BACKUP_PING_URL "$BACKUP_ENV")
# The same fallbacks the compose file uses for these two.
POSTGRES_USER=$(setting POSTGRES_USER "$APP_ENV")
POSTGRES_USER=${POSTGRES_USER:-chequeflow}
POSTGRES_DB=$(setting POSTGRES_DB "$APP_ENV")
POSTGRES_DB=${POSTGRES_DB:-chequeflow}

# A repository on a local path has to be visible inside the restic container.
REPOSITORY_MOUNT=()
case "$REPOSITORY" in
  /*) REPOSITORY_MOUNT=(-v "$REPOSITORY:$REPOSITORY") ;;
esac

restic() {
  docker run --rm --hostname chequeflow --env-file "$BACKUP_ENV" \
    "${REPOSITORY_MOUNT[@]}" "${RESTIC_MOUNTS[@]}" "$RESTIC_IMAGE" "$@"
}

# Two runs at once would race on the repository's lock and fail both.
exec 9>/tmp/chequeflow-backup.lock
flock -n 9 || { echo "Another backup is running" >&2; exit 1; }

WORK=$(mktemp -d /root/chequeflow-backup.XXXXXX)
trap 'rm -rf "${WORK:?}"' EXIT
chmod 700 "$WORK"

# The database first, then the images: every image a dumped row points at was
# already stored, whereas the other order could capture a row whose image is
# not in the backup.
"${COMPOSE[@]}" exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" >"$WORK/db.dump"

# An unreadable dump must fail here, tonight, not on the day it is needed.
"${COMPOSE[@]}" exec -T postgres pg_restore --list <"$WORK/db.dump" >/dev/null

RESTIC_MOUNTS=()
restic cat config >/dev/null 2>&1 || restic init

RESTIC_MOUNTS=(-v "$WORK:/backup/db:ro" -v chequeflow_storage-data:/backup/storage:ro)
restic backup /backup --tag daily

RESTIC_MOUNTS=()
restic forget --tag daily --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
restic check

# Silence is what a broken backup sounds like, so an outside service can raise
# the alarm when this stops arriving.
if [ -n "$PING_URL" ]; then
  curl -fsS -m 20 --retry 3 "$PING_URL" >/dev/null || echo "Could not report success" >&2
fi

echo "Backup finished: $(date -u +%FT%TZ)"
