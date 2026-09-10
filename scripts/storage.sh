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

# The pid of a process listening on our port, whoever it belongs to.
listener_pid() {
  command -v lsof >/dev/null 2>&1 || return 1
  lsof -t -nP -iTCP:"$STORAGE_PORT" -sTCP:LISTEN 2>/dev/null | head -1
}

# The pid of *our* stub, however it can be found, printed on stdout.
#
# The pid file alone was not enough. It does not survive a reboot, a `kill -9`
# or a machine that was put to sleep with the stub running, while the server it
# names carries on serving — and then `status` reported "not running" about a
# process that was answering every upload, and `start` walked into the port and
# died with an EADDRINUSE stack trace. The port is the thing that matters, so
# ask it, and confirm what answers is the stub and not somebody else's server.
stub_pid() {
  local pid
  if [ -f "$STORAGE_PID" ]; then
    pid="$(cat "$STORAGE_PID")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
  fi

  pid="$(listener_pid)" || return 1
  [ -n "$pid" ] || return 1
  ps -o command= -p "$pid" 2>/dev/null | grep -q 'storage-stub' || return 1

  # Found by the port: put the pid file back, so the next command is cheap.
  mkdir -p "$(dirname "$STORAGE_PID")"
  echo "$pid" > "$STORAGE_PID"
  echo "$pid"
}

running() {
  stub_pid >/dev/null 2>&1
}

case "${1:-status}" in
  start)
    if running; then
      echo "Already running on port $STORAGE_PORT (pid $(cat "$STORAGE_PID"))."
      exit 0
    fi

    # A port already taken by something that is not the stub is somebody else's
    # server and must not be assumed to be ours.
    #
    # This asked `curl -fsS`, which reports failure on any non-2xx reply — and
    # the stub answers `/` with 400, so the check read its own server as an
    # empty port and started a second one on top of it. What matters is whether
    # the connection is accepted at all, not what it answers.
    foreign="$(listener_pid || true)"
    if [ -n "$foreign" ]; then
      echo "Port $STORAGE_PORT is held by pid $foreign, which is not the stub:" >&2
      ps -o command= -p "$foreign" >&2
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
    pid="$(stub_pid || true)"
    if [ -n "$pid" ]; then
      kill "$pid"
      rm -f "$STORAGE_PID"
      echo "Stopped."
    else
      rm -f "$STORAGE_PID"
      echo "Not running."
    fi
    ;;

  status)
    pid="$(stub_pid || true)"
    if [ -n "$pid" ]; then
      echo "Running on port $STORAGE_PORT (pid $pid)."
    else
      foreign="$(listener_pid || true)"
      if [ -n "$foreign" ]; then
        echo "Not running, but port $STORAGE_PORT is held by pid $foreign:"
        ps -o command= -p "$foreign"
      else
        echo "Not running. Start it with: bash scripts/storage.sh start"
      fi
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
