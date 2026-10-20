# Agent notes: pi-office

Read-only isometric “window into Pi”. See `README.md` for the product and `SPEC.md` for the contract.

## Running / deploying

- Served by the systemd user service `pi-office` on `http://127.0.0.1:6702` (enabled, restarts on failure).
- Deploy with `sh scripts/install-local.sh` (= `node scripts/build.mjs` + `node scripts/setup.mjs install-service`:
  rewrites the unit keeping its existing `Environment=` lines, enables and restarts), or
  `npm run build && systemctl --user restart pi-office`. Preview first with `node scripts/setup.mjs install-service --dry-run`.
- `node scripts/setup.mjs doctor` is read-only: checks Node, build, data paths, config and the service manager.
- The server refuses unknown Host names (421). A public tunnel/proxy hostname must be in the service's
  `PI_OFFICE_ALLOWED_HOSTS` (and the proxy in `PI_OFFICE_TRUSTED_PROXIES`) before restarting; see `SECURITY.md`.
  Never add wildcard CORS, authentication theatre or a non-loopback bind without an explicit request.
- Do not start extra servers on `127.0.0.1:6702`. `npm run dev` (Expo web, :8081) is fine for UI iteration.
- Check status: `systemctl --user status pi-office`, logs: `journalctl --user -u pi-office`.
- Confirm with `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6702/` → `200`.

## Browser testing

- Use the lightweight native Rust `agent-browser` CLI, not direct Playwright.
- First-time browser setup: `npx agent-browser install` (Linux libraries if needed: `npx agent-browser install --with-deps`).
- Run `npm run test:browser` against the existing service on :6702, or set `OFFICE_BROWSER_URL=http://127.0.0.1:8081/` for an already-running dev server.
- The smoke test is read-only, uses an isolated session, and closes it on completion. Do not wait for networkidle: the office uses SSE.

## Before finishing

- `npm run check` (typecheck + server, scene and script tests + production `expo export -p web`).
- Production `dist/` comes from `npm run build` (`scripts/build.mjs` strips the mock/season/festive/API overrides).
  `npm run build:mock` is for local demos only; the installer refuses a mock build.
- Server tests must inject clocks (`OfficeStore` `now`), platforms/env (`server/paths.ts`) and deps
  (`createHandler`); never read the real `~/.pi` or desk state, never depend on the wall clock or host OS.

## Layout / rules

- `app/` is routes only. Screens/components live in `src/`.
- Scene math and layout: `src/scene/iso.ts`, `src/scene/layout.ts`, `src/scene/wall-art.ts`; animation model:
  `src/scene/use-scene-model.ts`; sprites: `character-sprite.tsx`; furniture: `furniture.tsx`.
- Seasons: pure rules and looks in `src/scene/season.ts` + `src/scene/sky.ts`, deterministic weather in
  `src/scene/season-particles.ts`, SVG layers (window weather, frames, wall pieces) in
  `src/scene/season-layers.tsx`; reduced motion via `src/hooks/use-reduced-motion.ts`. Four seasons only.
  The one approved festive overlay is Halloween — dated rules in `src/scene/festive.ts`, static SVG in
  `src/scene/festive-layers.tsx`. It is independent of the season (never changes sky, light, weather or season
  wall pieces) and no other holiday/decoration may be added unless explicitly requested. No floor decor in
  either layer, so routing/depth stay untouched.
- Data hook: `src/hooks/use-office.ts` (SSE + reconnect backoff, polling fallback). Tick: `src/hooks/use-tick.ts`
  (≤20 fps, pauses when hidden). Default API is same-origin; `EXPO_PUBLIC_OFFICE_API` overrides.
- Read-only: never add controls that write to Pi or `~/.pi`. The card is stats only.
- Desk occupancy is server-owned (`shared/desk-allocation.ts`, persisted by `server/desks.ts`). The client only places characters at the snapshot's `desk`; never assign desks in the client. Sole exemption: the dev mock (`src/api/mock.ts`) runs the shared allocator to simulate the server; it is never in a production build.
- Styling is NativeWind/Tailwind; the scene is `react-native-svg` only. Keep both web and native working.
- Mock feed: `EXPO_PUBLIC_OFFICE_MOCK=1` (`src/api/mock.ts`), cycles states every ~4 s.
- Season preview: `?season=winter|spring|summer|autumn` (or `fall`), then `EXPO_PUBLIC_OFFICE_SEASON`, then
  the local calendar. Invalid overrides are ignored.
- Festive preview: `?festive=halloween|none|auto`, then `EXPO_PUBLIC_OFFICE_FESTIVE`, then the local calendar
  (Oct 17 – Nov 7 inclusive). `auto` is a real value, so `?festive=auto` beats the env var.
  Keep the production build without either env var.
- Shared API types: `shared/office-types.ts` (do not change without updating `server/`).
