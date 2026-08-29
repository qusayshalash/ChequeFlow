#!/usr/bin/env bash
#
# Runs a command with Node.js on PATH.
#
# Tooling like Next.js/Turbopack spawns `node` child processes by looking it up
# on PATH, so an absolute path to the node binary is not enough. This wrapper
# prepends the usual install locations, then execs whatever it was given.
#
# Usage: ./scripts/with-node-path.sh pnpm --filter @cheque-flow/web dev
set -euo pipefail

# The launcher may start this script from an unreadable working directory, so
# move to the repository root (the script's parent) before doing anything.
cd "$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"

for candidate in \
  "$HOME/.local/opt/node/bin" \
  "/opt/homebrew/bin" \
  "/usr/local/bin" \
  "$HOME/.volta/bin" \
  "$HOME/.nvm/versions/node/current/bin"; do
  if [ -x "$candidate/node" ]; then
    PATH="$candidate:$PATH"
    break
  fi
done
export PATH

if ! command -v node >/dev/null 2>&1; then
  echo "error: node was not found. Install Node.js >= 22.12 and re-run." >&2
  exit 127
fi

exec "$@"
