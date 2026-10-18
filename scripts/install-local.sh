#!/bin/sh
# Build the web app and (re)start the Pi Office server as a systemd user service, running in place from this
# repo.
#   sh scripts/install-local.sh            # build, write unit, enable, restart
#   PORT=6702 sh scripts/install-local.sh
# Code change later: sh scripts/install-local.sh (or npm run build && systemctl --user restart pi-office)
# Data: none. Everything is read from Pi's session files (~/.pi/agent/sessions) — never written.
set -eu
cd "$(dirname "$0")/.."
REPO=$(pwd)
PORT=${PORT:-6702}
HOST=${HOST:-127.0.0.1}
UNIT_DIR="$HOME/.config/systemd/user"
NODE=$(readlink -f "$(command -v node)") # resolve fnm/nvm shims to the real binary

npm run build
mkdir -p "$UNIT_DIR"

cat > "$UNIT_DIR/pi-office.service" <<UNIT
[Unit]
Description=Pi Office
After=network-online.target

[Service]
WorkingDirectory=$REPO
Environment=HOST=$HOST
Environment=PORT=$PORT
ExecStart=$NODE $REPO/server/index.ts
Restart=always
RestartSec=3
TimeoutStopSec=10

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable pi-office.service >/dev/null
systemctl --user restart pi-office.service
echo "pi-office running on http://$HOST:$PORT (from $REPO/dist)"
