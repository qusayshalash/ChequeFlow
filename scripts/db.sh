#!/bin/bash
#
# Start, stop or inspect the local PostgreSQL that holds your data.
#
# The database lives in ~/ChequeFlowData, deliberately outside this repository:
# nothing here — a clean checkout, a branch switch, a `rm -rf node_modules` —
# can reach it.
#
#   bash scripts/db.sh start|stop|status|psql|backup
#
set -uo pipefail

PG_HOME="${PG_HOME:-$HOME/.local/opt/postgres}"
PG_DATA="${PG_DATA:-$HOME/ChequeFlowData/pgdata}"
PG_LOG="${PG_LOG:-$HOME/ChequeFlowData/postgres.log}"
PG_PORT="${PG_PORT:-5433}"

export PATH="$PG_HOME/bin:$PATH"

if ! command -v pg_ctl >/dev/null 2>&1; then
  echo "PostgreSQL is not where this script expects it: $PG_HOME" >&2
  exit 1
fi

case "${1:-status}" in
  start)
    if pg_isready -h localhost -p "$PG_PORT" >/dev/null 2>&1; then
      echo "Already running on port $PG_PORT."
    else
      pg_ctl -D "$PG_DATA" -l "$PG_LOG" start
      sleep 2
      pg_isready -h localhost -p "$PG_PORT"
    fi
    ;;

  stop)
    # Fast shutdown: refuse new connections, roll back what is in flight, and
    # leave the data consistent on disk.
    pg_ctl -D "$PG_DATA" -m fast stop
    ;;

  status)
    pg_isready -h localhost -p "$PG_PORT" || echo "Not running. Start it with: bash scripts/db.sh start"
    ;;

  psql)
    PGPASSWORD="${PGPASSWORD:-chequeflow_local}" \
      psql -h localhost -p "$PG_PORT" -U chequeflow -d chequeflow
    ;;

  backup)
    # A physical dump alongside the API's JSON archive. This one restores the
    # database exactly; the JSON one is the readable copy.
    out="$HOME/ChequeFlowData/dump-$(date +%Y-%m-%d-%H%M).sql"
    PGPASSWORD="${PGPASSWORD:-chequeflow_local}" \
      pg_dump -h localhost -p "$PG_PORT" -U chequeflow -d chequeflow --no-owner > "$out"
    echo "Wrote $out ($(du -h "$out" | cut -f1))"
    ;;

  *)
    echo "usage: bash scripts/db.sh start|stop|status|psql|backup" >&2
    exit 1
    ;;
esac
