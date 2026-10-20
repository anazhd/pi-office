#!/bin/sh
# Compatibility wrapper (Linux/macOS): build the production web app, then install/restart the per-user service via
# the portable setup CLI. Same as:
#   npm run build && node scripts/setup.mjs install-service "$@"
# Examples:
#   sh scripts/install-local.sh                      # keep the installed service's settings, rebuild, restart
#   PORT=6703 sh scripts/install-local.sh            # change a setting (server variables in the env are carried over)
#   sh scripts/install-local.sh --env PI_OFFICE_ALLOWED_HOSTS=office.example.com
#   sh scripts/install-local.sh --dry-run            # still builds; prints the unit and commands without applying them
# Windows: npm run build, then node scripts/setup.mjs install-service. See README.md.
# Data: Pi's session logs are only read, never written. The server's only write is its desk-state file.
set -eu
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not on PATH. Install Node >= 24.12 (https://nodejs.org or fnm/nvm/Homebrew) and retry." >&2
  exit 1
fi
node scripts/build.mjs
exec node scripts/setup.mjs install-service "$@"
