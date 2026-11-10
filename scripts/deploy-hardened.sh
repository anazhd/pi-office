#!/bin/sh
# Host-specific deployment. Build as the trusted developer; runtime stays unprivileged.
set -eu
cd "$(dirname "$0")/.."
[ "$(id -u)" = 0 ] || { echo "Run deployment as root (not the application user)." >&2; exit 1; }
[ "$#" = 0 ] || { echo "Configure deploy/pi-office.service; this host deploy accepts no arguments." >&2; exit 1; }
node scripts/build.mjs
# Refresh access for files replaced by Pi or build tools. Never grant access to all of /root.
setfacl -R -m g:pi-data-readers:r-X /root/.pi/agent/sessions
find /root/.pi/agent/sessions -type d -exec setfacl -m d:g:pi-data-readers:r-x {} +
[ ! -f /root/.pi/agent/models-store.json ] || setfacl -m u:pi-office:r /root/.pi/agent/models-store.json
install -m 644 deploy/pi-office.service /etc/systemd/system/pi-office.service
systemd-analyze verify /etc/systemd/system/pi-office.service
systemctl daemon-reload
systemctl enable pi-office.service
systemctl restart pi-office.service
# Wait for readiness, without printing response contents (which may contain private data).
i=0
until curl --fail --silent --output /dev/null http://127.0.0.1:6702/; do
  i=$((i+1))
  [ "$i" -lt 30 ] || { systemctl --no-pager status pi-office; exit 1; }
  sleep 1
done
echo "pi-office deployed as pi-office; HTTP readiness passed."
