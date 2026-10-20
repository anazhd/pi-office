# Contributing

Thanks for helping. Pi Office is a small, read-only viewer; changes should keep it that way.

## Ground rules

- **Read-only.** Never write to `~/.pi` (or any Pi data dir), never call Pi, add no controls that change anything.
  The only file the server writes is its desk-state JSON.
- **No content leaks.** Snapshots may carry only the fields in `shared/office-types.ts`. Never send prompts,
  responses, thinking, tool arguments/output or session titles. Add a test when touching parsing.
- **Zero-dependency server.** `server/` and `shared/` use Node built-ins only and erasable TypeScript (Node runs
  them directly: no enums, namespaces or parameter properties; `import type`; `.ts` import extensions).
- **Secure defaults.** Anything that widens network exposure must be opt-in, documented in `SECURITY.md` and tested.
- Desks are server-owned (`shared/desk-allocation.ts` via `server/desks.ts`). The only client-side user of the
  allocator is the development mock (`src/api/mock.ts`), which simulates the server and never ships.
- Keep web and native working (NativeWind for chrome, `react-native-svg` for the scene).

## Setup

Node >= 24.12 on Linux, macOS or Windows.

```sh
npm ci
EXPO_PUBLIC_OFFICE_MOCK=1 npm run dev     # UI work with the fixture (Expo web on :8081)
npm run check                            # typecheck + server, scene and script tests + production build
```

`npm run build:mock` makes a fixture build for demos only; never deploy it (the installer refuses).
The browser smoke test (`npm run test:browser`) needs a running server and the agent-browser CLI; it is read-only.

## Pull requests

- Keep changes focused; update `README.md`/`SPEC.md` when behaviour changes.
- Tests must not read the real `~/.pi` or desk state and must not depend on the wall clock or the host OS: inject
  clocks (`OfficeStore` `now` option), env/platform/home (`server/paths.ts`) and file systems.
- CI runs on Ubuntu, macOS and Windows. Service installers are tested as rendered plans
  (`scripts/setup.test.mjs`); if you change one, say which real OS you tried it on.
- Security issues: see `SECURITY.md`, not public issues.

## License

Pi Office is licensed under the [MIT License](LICENSE). By submitting a contribution, you agree to license your
contribution under the same MIT terms. Third-party dependencies retain their own licenses.
