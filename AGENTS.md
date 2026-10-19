# Agent notes: pi-office

Read-only isometric “window into Pi”. See `README.md` for the product and `SPEC.md` for the contract.

## Running / deploying

- Served by the systemd user service `pi-office` on `http://127.0.0.1:6702` (enabled, restarts on failure).
- Deploy with `sh scripts/install-local.sh` (builds `dist/`, rewrites the unit, enables and restarts), or
  `npm run build && systemctl --user restart pi-office`.
- Do not start extra servers on `127.0.0.1:6702`. `npm run dev` (Expo web, :8081) is fine for UI iteration.
- Check status: `systemctl --user status pi-office`, logs: `journalctl --user -u pi-office`.
- Confirm with `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6702/` → `200`.

## Browser testing

- Use the lightweight native Rust `agent-browser` CLI, not direct Playwright.
- First-time browser setup: `npx agent-browser install` (Linux libraries if needed: `npx agent-browser install --with-deps`).
- Run `npm run test:browser` against the existing service on :6702, or set `OFFICE_BROWSER_URL=http://127.0.0.1:8081/` for an already-running dev server.
- The smoke test is read-only, uses an isolated session, and closes it on completion. Do not wait for networkidle: the office uses SSE.

## Before finishing

- `npm run check` (typecheck + server tests + `expo export -p web`).
- Production `dist/` must be built **without** `EXPO_PUBLIC_OFFICE_MOCK`. Use the mock only for local UI work.

## Layout / rules

- `app/` is routes only. Screens/components live in `src/`.
- Scene math and layout: `src/scene/iso.ts`, `src/scene/layout.ts`; animation model:
  `src/scene/use-scene-model.ts`; sprites: `character-sprite.tsx`; furniture: `furniture.tsx`.
- Data hook: `src/hooks/use-office.ts` (SSE + reconnect backoff, polling fallback). Tick: `src/hooks/use-tick.ts`
  (≤20 fps, pauses when hidden). Default API is same-origin; `EXPO_PUBLIC_OFFICE_API` overrides.
- Read-only: never add controls that write to Pi or `~/.pi`. The card is stats only.
- Desk occupancy is server-owned (`shared/desk-allocation.ts`, persisted by `server/desks.ts`). The client only places characters at the snapshot's `desk`; never assign desks in the client.
- Styling is NativeWind/Tailwind; the scene is `react-native-svg` only. Keep both web and native working.
- Mock feed: `EXPO_PUBLIC_OFFICE_MOCK=1` (`src/api/mock.ts`), cycles states every ~4 s.
- Shared API types: `shared/office-types.ts` (do not change without updating `server/`).
