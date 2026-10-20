# Security policy

Pi Office is a read-only viewer for [Pi](https://pi.dev) session logs. It has **no authentication**: whoever can
reach the server can read the office snapshot. Its security model is "local by default, public only on purpose".

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting
("Security" → "Report a vulnerability") on the repository, or contact the maintainer privately. Include the
version/commit, your configuration (redact host names if you like) and a reproduction. We aim to acknowledge reports
within a week. Only the latest `main` is supported.

## What the server exposes

`GET /api/office` and `GET /api/stream` return an `OfficeSnapshot` (`shared/office-types.ts`):

- model ids, providers and display names Pi has used (all-time, until 24 h idle on the floor)
- **project basenames** of active sessions (`basename(cwd)`, e.g. `acme-payroll`), tool **names** (`bash`,
  `mcp__github__…`) and a 10-character hash of each session id
- token counts (input/output, today/lifetime), message/tool-call/session counts, first/last-seen timestamps, and
  therefore *when* you work

It never sends prompts, responses, thinking, tool arguments or output, session titles, full paths, credentials or
anything from `auth.json`/`settings.json`. Project names and tool names can still be sensitive (client names,
internal MCP servers, working hours). Treat a public office as publishing that metadata.

## Defaults (no configuration)

- Binds `127.0.0.1:6702`. A non-loopback `HOST` is refused unless `PI_OFFICE_ALLOW_REMOTE_BIND=1`.
- Serves only the Host names `localhost`, `127.0.0.1` and `[::1]`; any other `Host` gets `421`. This stops
  DNS-rebinding pages from reading the local API.
- API requests carrying a foreign `Origin` get `403` (only same-origin and `http://localhost|127.0.0.1|[::1]:*`
  dev origins are allowed). There is no wildcard CORS.
- Forwarded headers (`X-Forwarded-For`, `CF-Connecting-IP`, …) are ignored.
- At most 64 live SSE streams in total and 8 per client address (IPv6 grouped by /64); slow readers are evicted
  after 256 KiB of backlog or 10 s without draining. Snapshots are cached for 250 ms, so request floods do not
  multiply work, and desk-state writes are coalesced off the request path.
- Static files are served only from the real `dist/` directory: traversal, encoded separators and symlinks that
  resolve outside it are refused.
- Every response carries `Content-Security-Policy` (scripts from self only, no framing), `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy` and
  `Cross-Origin-Resource-Policy`. Only `GET`/`HEAD` are accepted.
- Nothing is written under `~/.pi`; the only file written is the desk-state JSON (see README).

## Publishing the office (explicit opt-in)

Keep the server on loopback and put a reverse proxy or tunnel (Cloudflare Tunnel, Caddy, nginx, Tailscale Funnel)
in front of it. Then tell the server which public name it is serving and which proxy to believe:

| Variable | Example | Effect |
| --- | --- | --- |
| `PI_OFFICE_ALLOWED_HOSTS` | `office.example.com` | Serve this Host name. **This is the switch that makes the office public there.** Bare names only: no scheme, port or wildcard. |
| `PI_OFFICE_TRUSTED_PROXIES` | `127.0.0.1,::1` | Peer IPs whose client-IP header is believed (exact IPs, no ranges). |
| `PI_OFFICE_CLIENT_IP_HEADER` | `cf-connecting-ip` | Header to read from a trusted proxy: `x-forwarded-for` (default; rightmost untrusted hop), `cf-connecting-ip` or `x-real-ip`. |
| `PI_OFFICE_ALLOWED_ORIGINS` | `https://dash.example.com` or `*` | Extra cross-origin readers of the API (`*` = anyone, deliberately public API). Native apps need nothing here. |
| `PI_OFFICE_SSE_MAX_CLIENTS` / `PI_OFFICE_SSE_PER_CLIENT` | `64` / `8` | Stream caps. |
| `PI_OFFICE_ALLOW_REMOTE_BIND` | `1` | Allow `HOST=0.0.0.0` or a LAN address. Prefer a proxy instead. |

Example for a Cloudflare Tunnel whose `cloudflared` runs on the same machine:

```sh
node scripts/setup.mjs install-service \
  --env PI_OFFICE_ALLOWED_HOSTS=office.example.com \
  --env PI_OFFICE_TRUSTED_PROXIES=127.0.0.1,::1 \
  --env PI_OFFICE_CLIENT_IP_HEADER=cf-connecting-ip
```

The server logs `public hosts: …` at startup so the exposure is visible in the service log.

**Upgrading an existing public deployment:** earlier versions accepted any Host and sent wildcard CORS. After
upgrading, a tunnel hostname that is not in `PI_OFFICE_ALLOWED_HOSTS` gets `421`. Add it (as above) *before*
restarting the service; the installer preserves the rest of the service's settings.

### Why the per-client cap needs a declared proxy

Behind a tunnel or reverse proxy every viewer arrives from the proxy's address. Pi Office never believes a forwarded
header from an undeclared peer, because a direct client could forge it. So:

- **Proxy declared** (`PI_OFFICE_TRUSTED_PROXIES`): the per-client cap applies to the real client address. A
  request from the proxy without a usable header shares one capped `proxy:unknown` bucket.
- **Proxy not declared and it connects over loopback:** if public hosts are configured, all viewers share one
  capped address bucket. This prevents one visitor consuming all global slots, but can limit unrelated viewers
  together. Declare the proxy to get independent per-client limits. Loopback peers are exempt only when the
  office has no public hosts configured.
- Trusting `127.0.0.1` also trusts other local users and processes to set the header. On a shared machine, prefer a
  proxy on a dedicated address.

A determined attacker with many addresses can still occupy the global stream cap; viewers then fall back to
`503` + retry. Use your proxy/CDN's rate limiting (e.g. a Cloudflare rate-limiting rule on `/api/stream`) for
internet-facing offices. HTTPS and HSTS are the proxy's job.

## Privacy review before publishing

1. Run `node scripts/setup.mjs doctor` and check which sessions directory is read.
2. Open `http://127.0.0.1:6702/api/office` and read the JSON: every `project` and `tool` value will be public.
3. If a project name is sensitive, rename the working directory, keep that work out of the scanned sessions dir
   (`PI_OFFICE_SESSIONS_DIR`), or do not publish.
4. Remember the timestamps reveal working hours, and model ids reveal which providers you pay for.
5. Decide whether search engines may index it (add `X-Robots-Tag: noindex` at the proxy if not).
6. Put access control (Cloudflare Access, basic auth, Tailscale) at the proxy if the audience is not "everyone".

## Releasing this repository publicly

- The code is licensed under MIT; retain the copyright and license notice in distributed copies or substantial portions.
- Git history contains the author name/email of existing commits; history is not rewritten.
- Run a full secret scanner (e.g. `gitleaks detect`, `trufflehog git file://.`) over the history; a heuristic
  scan is not a guarantee.
- Dependency advisories without upstream fixes are tracked in `DEPENDENCIES.md`.
