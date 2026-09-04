#!/bin/bash
#
# Start, stop or inspect the local stand-in for S3 that holds cheque images.
#
# The API stores cheque photographs in object storage. On a machine with no
# Docker and no MinIO there is nothing listening, so an upload fails and eight
# of the end-to-end tests fail with it. `scripts/storage-stub.mjs` answers the
# handful of requests the API actually makes.
#
# It is a development tool and nothing else: it does no authentication and
# binds to loopback only. Read the header of the stub for what that means.
#
# Objects live in ~/ChequeFlowData/storage, next to the database and
# deliberately outside this repository, so nothing here can reach them.
#
#   bash scripts/storage.sh start|stop|status|logs
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_HOME="${NODE_HOME:-$HOME/.local/opt/node}"
STORAGE_PORT="${STORAGE_STUB_PORT:-9000}"
STORAGE_LOG="${STORAGE_STUB_LOG:-$HOME/ChequeFlowData/storage.log}"
STORAGE_PID="${STORAGE_STUB_PID:-$HOME/ChequeFlowData/storage.pid}"

export PATH="$NODE_HOME/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Node is not where this script expects it: $NODE_HOME" >&2
  exit 1
fi

running() {
  [ -f "$STORAGE_PID" ] && kill -0 "$(cat "$STORAGE_PID")" 2>/dev/null
}

case "${1:-status}" in
  start)
    if running; then
      echo "Already running on port $STORAGE_PORT (pid $(cat "$STORAGE_PID"))."
      exit 0
    fi

    # A stale pid file outlives a crash; a port already taken is somebody
    # else's server and must not be assumed to be ours.
    if curl -fsS -o /dev/null "http://127.0.0.1:$STORAGE_PORT/" 2>/dev/null; then
      echo "Something is already listening on port $STORAGE_PORT. Not starting a second one." >&2
      exit 1
    fi

    mkdir -p "$(dirname "$STORAGE_LOG")"
    nohup node "$REPO_ROOT/scripts/storage-stub.mjs" >"$STORAGE_LOG" 2>&1 &
    echo $! > "$STORAGE_PID"
    sleep 1

    if running; then
      head -1 "$STORAGE_LOG"
    else
      echo "Failed to start. Log:" >&2
      cat "$STORAGE_LOG" >&2
      rm -f "$STORAGE_PID"
      exit 1
    fi
    ;;

  stop)
    if running; then
      kill "$(cat "$STORAGE_PID")"
      rm -f "$STORAGE_PID"
      echo "Stopped."
    else
      rm -f "$STORAGE_PID"
      echo "Not running."
    fi
    ;;

  status)
    if running; then
      echo "Running on port $STORAGE_PORT (pid $(cat "$STORAGE_PID"))."
    else
      echo "Not running. Start it with: bash scripts/storage.sh start"
    fi
    ;;

  logs)
    tail -f "$STORAGE_LOG"
    ;;

  *)
    echo "usage: bash scripts/storage.sh start|stop|status|logs" >&2
    exit 1
    ;;
esac
