# Agent notes: pi-office

Read-only isometric “window into Pi”. See `README.md` for the product and `SPEC.md` for the contract.

## Running / deploying (this server)

- Read `deploy/README.md` for the hardened deployment and permissions contract.
- Keep editing this checkout normally. After changes, run **`sh scripts/install-local.sh`**:
  builds, refreshes scoped ACLs, installs the versioned unit, restarts and health-checks.
- Runtime is the dedicated non-root user `pi-office` in a sandboxed **system** service.
  Use `systemctl restart pi-office`, `systemctl status pi-office`, and `journalctl -u pi-office`;
  **never `systemctl --user` or a root-running replacement server**.
- Source stays here, read-only mounted at `/srv/pi-office` inside the service.
  Pi data is read-only at `/var/lib/pi-data`; root's home and vault are hidden.
- Change production service settings in `deploy/pi-office.service`, then deploy.
- Do not start duplicate production servers on :6702.
- Preserve allowed-host and trusted-proxy restrictions. Do not use the portable setup installer to replace this server's hardened deployment.

## Browser testing

- Browser checks use T3's preview tools (see the global AGENTS.md). The former `npm run test:browser` smoke test and its agent-browser CLI were removed.
- Do not wait for networkidle: the office uses SSE.

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
