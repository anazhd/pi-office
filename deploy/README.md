# Hardened deployment on this server

## Everyday development
Keep editing /root/github/pi-office normally as the trusted developer.
Deploy after edits with ONE command from this repository:

```sh
sh scripts/install-local.sh
```

This builds, refreshes scoped data ACLs, installs the versioned unit, restarts the
system service and waits for HTTP readiness. No copying application code, changing
ownership after edits, or manually switching users. For restart-only changes:
`systemctl restart pi-office` (NOT `--user`).
Status: `systemctl status pi-office`. Logs: `journalctl -u pi-office`.
Changes to server settings belong in `deploy/pi-office.service`; deploy applies them.
The portable user-service installer is not this server's deployment method.

## Runtime boundary
Dedicated non-login user pi-office; no sudo or Linux capabilities. Root-owned source
stays in its original project folder, mounted read-only at /srv/pi-office inside the
service. /root, /home and /run/user are hidden by ProtectHome=tmpfs.
Only Pi sessions are mounted at /var/lib/pi-data/sessions.
Office additionally receives read-only settings.json, models-store.json and models.json. Its only persistent writable state is /var/lib/pi-office/desks.json, migrated from the previous root-owned state.
Private temporary storage is writable. System files and application code are
read-only. Forked processes retain the sandbox and unprivileged identity.
Loopback ports and existing Cloudflare routing are unchanged.

Sessions use group pi-data-readers with read/traverse ACLs and directory default
ACLs for future files. No traversal permission on the real /root is granted.
Explicit creation with mode 0600 or replacement via rename can override inherited
access; deployment refreshes existing session ACLs. If new sessions stop appearing,
inspect ACLs rather than broadening permissions. Replacement of models-store.json likewise needs the deployment ACL refresh.
Data is read-only, NOT sanitized: a compromised app can disclose readable sessions.
This does not isolate host-wide world-readable files or prevent kernel exploits.

## Host provisioning / recovery
Requires Debian systemd, acl package, curl, dedicated system users pi-office, and shared
system group pi-data-readers. The users have that supplementary group.
A root-owned copy of the existing Node v26 runtime is at /usr/local/lib/pi-node/node
(mode 0755); this is independent of root's fnm paths. Upgrade that binary deliberately
when upgrading Node, then restart both services. Do not point ExecStart into /root.

Canonical unit: deploy/pi-office.service, installed at /etc/systemd/system/pi-office.service.
Initial setup granted recursive group read/traverse ACLs to
/root/.pi/agent/sessions and default group ACLs on its directories.
models-store.json has a read ACL for pi-office. /var/lib/pi-office is owned by pi-office, mode 0700; desk state is mode 0600.
Old root user units are disabled and masked. Their original definitions are backed
up in /root/.local/state/pi-hardening-backup/. Never unmask/start those alongside the
system services or roll back to root merely to fix permissions.
Source changes already in the working tree were preserved.

Validation: HTTP 200, correct service UID, session visibility, denied vault access
and denied source writes inside the running mount namespace. Use systemd-analyze
verify on units before installing and journalctl after restart.
