# Pi Office — spec

A read-only, gamified "window" into Pi. An isometric open-plan office with hot desks. Every model Pi has ever used
(lifetime, from session logs) is a character. When Pi is working with a model, that character walks to a free hot
desk and works; when nothing is running, everyone sits in the lounge relaxing with coffee.

Sibling of `/root/github/pi-stats` (read it for patterns: session tailing, systemd install script, SSE).

## Hard rules

1. **Pure viewer.** Never write to `~/.pi`, never call Pi, no extension, no hooks. Only `fs.read*`/`fs.watch`/`stat`.
2. **No content leaks.** Never send message text, thinking, tool arguments or tool output to the client. Allowed:
   provider, model, display name, tool *name*, project basename (`path.basename(cwd)`), session id hash, token
   counts, timestamps, stop reasons.
3. **Not a gateway.** The UI has no inputs that affect Pi. Tapping a character only opens a read-only stat card.
4. Bind to `127.0.0.1:6702`. Exposed publicly via Cloudflare tunnel as `office.anazhd.com` (done by orchestrator).

## Tech stack

- **App:** Expo SDK 58 (`expo@^58`), Expo Router, TypeScript, **NativeWind + Tailwind** for all styling of chrome
  (HUD, cards, legends). Isometric scene drawn with **`react-native-svg`** (works on web + iOS + Android).
  Animation: `react-native-reanimated` is allowed but a simple shared `useTick(fps)` clock + SVG transforms is
  fine and preferred for simplicity. Must work with `npx expo export -p web` (web output `single`).
  Install deps with `npx expo install`. NativeWind: prefer stable `nativewind@^4` + `tailwindcss@^3.4`
  (follow nativewind docs for Expo: `babel.config.js`, `metro.config.js` `withNativeWind`, `global.css`,
  `nativewind-env.d.ts`). If it is genuinely incompatible with SDK 58, use `nativewind@5` preview +
  `tailwindcss@4` + `react-native-css` per its docs. Either way verify classes render in the web export.
- **Server:** zero-dependency Node (v26, runs `.ts` directly via native type stripping, like pi-stats tests —
  so use only erasable TS syntax: no enums, no namespaces, no parameter properties, use `import type`, and
  include `.ts` extensions in relative imports). Serves the exported web app (`dist/`) with SPA fallback plus
  the API. Kept separate from Expo so the future mobile app can point at the same API.
- **Shared contract:** `shared/office-types.ts` (already written, do not change shape without updating both sides).

## Layout

```
SPEC.md
shared/office-types.ts         API contract (types only)
server/
  index.ts                     http server: static dist/ + /api/*, PORT/HOST env (default 127.0.0.1:6702)
  sessions.ts                  scanner/tailer/watcher over ~/.pi/agent/sessions/**/*.jsonl (I/O)
  parse.ts                     pure: JSONL line -> event; per-session state reducer; roster aggregation
  office.ts                    pure: build OfficeSnapshot from session states + roster + now
  names.ts                     pure: display names (models-store.json lookup + heuristic fallback)
  tests/*.test.ts              node --test
app/                           Expo Router routes (app/_layout.tsx, app/index.tsx)
src/
  api/                         client: fetch snapshot, SSE subscribe (EventSource) w/ polling fallback
  scene/                       isometric math, office layout, furniture, character sprites
  components/                  HUD, character card, legend (NativeWind)
  hooks/                       useOffice(), useTick()
scripts/install-local.sh       build web + write/enable/restart systemd user unit `pi-office`
```

## Data source & state detection (server)

Session dir: `$PI_OFFICE_SESSIONS_DIR` or `$PI_CODING_AGENT_DIR/sessions` or `~/.pi/agent/sessions`.
Files: `<dir>/<cwd-slug>/<iso>_<uuid>.jsonl`, append-only. Read once fully at startup, then tail from byte offset
(handle partial trailing line; handle truncation/deletion → drop file state). `fs.watch(dir, {recursive:true})`
with ~300ms debounce, plus a 5s interval tick (time-based transitions) and a 60s full directory sweep fallback.

Relevant line types (one JSON object per line):

- `{"type":"session", "id", "timestamp", "cwd"}` — header. `project = basename(cwd)`.
- `{"type":"model_change", "timestamp", "provider", "modelId"}` — current model of the session.
- `{"type":"thinking_level_change", "thinkingLevel"}`.
- `{"type":"session_info", "name"}` — session title. **Do not send to client** (may contain prompt text).
- `{"type":"message", "timestamp", "message": {...}}` where `message.role` is:
  - `"user"` → a turn started; model is now generating.
  - `"assistant"` with `provider`, `model`, `stopReason` (`"toolUse" | "stop" | "error" | "aborted" | "length"`),
    `usage {input, output, cacheRead, cacheWrite}`, `durationMs`, `content[]` (items with `type:"toolCall", name`).
    Assistant lines are written only when that reply finishes.
  - `"toolResult"` with `toolName`, optional `isError` → tool finished; infer continuation only in an open turn.
- other types (`custom`, ...) → ignore.

Per-session status (derived from relevant message events, never file mtime):

| last relevant line                         | status      | activity                          |
|--------------------------------------------|-------------|-----------------------------------|
| user message                               | `thinking`  | –                                 |
| successful toolResult in open turn         | `thinking`  | inferred continuation             |
| failed toolResult (`isError`)               | idle        | until user/assistant continuation |
| toolResult after idle/terminal reply        | idle        | cannot reopen a terminated turn   |
| assistant stopReason `toolUse`             | `tool`      | `tool` = last toolCall name       |
| assistant `stop`/`error`/`aborted`/`length`| idle        |                                   |
| model_change / header only                 | idle        |                                   |

A terminal assistant reply (`stop`, `error`, `aborted`, `length`) closes inferred work immediately;
trailing tool results cannot revive it. A new user message or assistant `toolUse` continuation resumes work,
including retries without a new user message. Failed tool results cease inferred work, but are not proof that
the agent exited: a later assistant continuation can recover. Failures remain lifetime stats, not working badges.
Each session is reduced independently; another active session of the same model still keeps the model working.

JSONL cannot prove whether a silent tool/LLM is alive. Use a conservative inactivity lease from the last relevant
activity event timestamp: `STALE_MS = 10 min` for thinking (including successful tool results awaiting an assistant),
`TOOL_STALE_MS = 60 min` for tool execution. Missing timestamps expire, never fall back to mtime. Title/custom
entries, touches and unrelated metadata updates cannot renew work. These leases are inference, not exact liveness:
a killed process can look active until expiry, and a real tool silent for over an hour can look idle. No Pi writes,
hooks, extensions or historical-log edits. Runtime inspection found T3 uses embedded Pi in generic Node workers
without exact session IDs in argv; process presence cannot safely renew a session. Pi `agent_end`/`turn_end` are
runtime events, not persisted lifecycle entries; arbitrary custom entries must not be interpreted as termination.
The session's model = provider/model of last assistant message, overridden by any later `model_change`.
The existing client 20-second desk grace applies to all idle transitions, including errors: badges stop immediately,
then the character returns to coffee after the bounded grace (no extra terminal status is sent to the client).

**Roster** (lifetime): every distinct `provider + "/" + model` seen in any assistant message (successful or not),
plus models from model_change that have at least one assistant message. Aggregate per character: `messages`,
`outputTokens`, `inputTokens` (input+cacheRead+cacheWrite), `toolCalls`, `firstSeen`, `lastSeen`,
`todayOutputTokens` (local server day), `sessions` (distinct session ids). De-duplicate forked copies of the same
assistant message by `provider:model:message.timestamp:usage.output` (same as pi-stats).

**Display names:** read `~/.pi/agent/models-store.json` (shape `{ [provider]: { models: [{id, name}] } }`, read
only, tolerate missing/invalid) and `~/.pi/agent/models.json` similarly. Fallback heuristic: strip vendor prefix
(`deepseek/`), strip date/numeric suffix (`-1017`, `-20251001`), `claude-opus-5-5` → `Opus 5.5`,
`gpt-6.1-sol` → `GPT-6.1 Sol`, `deepseek-v4.1-flash` → `DeepSeek V4.1 Flash`. Unit-test the heuristic.

**Gamification** (pure, unit-tested): `xp = outputTokens`; `level = floor(sqrt(xp / 2000)) + 1`;
`title` by level: 1–2 Intern, 3–4 Junior, 5–7 Engineer, 8–11 Senior, 12–16 Staff, 17+ Principal.
`levelProgress` 0..1 to next level.

## API

- `GET /api/office` → `OfficeSnapshot` JSON.
- `GET /api/stream` → SSE. On connect and whenever the snapshot changes (compare a cheap JSON hash), send
  `event: snapshot\ndata: <OfficeSnapshot JSON>\n\n`. Heartbeat comment `: ping` every 25s. Clean up on close.
  Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`.
- `GET /api/health` → `{ok:true}`.
- Everything else: static from `dist/` (correct content types, `index.html` fallback for non-file paths, no
  directory traversal). `Cache-Control: no-cache` for index.html, long cache for `/_expo/static/*`.
- CORS `Access-Control-Allow-Origin: *` on `/api/*` (future mobile app). GET/HEAD only; others 405.

## Scene (app)

Isometric 2:1 projection: `screenX = (gx - gy) * TILE_W/2`, `screenY = (gx + gy) * TILE_H/2`, TILE_W=64,
TILE_H=32. Office floor ~ 14×10 tiles in an SVG with a `viewBox` that scales to the window (fit width on
mobile, centered on desktop). Painter's algorithm: sort drawables by `gx + gy` (then by z).

Furniture (simple flat-shaded iso boxes, 3 faces each, tasteful palette, soft shadows):
- Back walls (two sides) with big windows; window tint follows local time (day/evening/night).
- **Hot desk area:** 2 long bench desks, 4 seats per side → 8–12 desk slots, each with monitor + chair.
  Monitor screen glows + shows tiny scrolling code lines when occupied.
- **Lounge:** sofas + armchairs + coffee table + rug, coffee machine on a counter, plants, a bookshelf.
  Enough lounge seats for 16 characters (beanbags fill extra).
- Small wall "ops board" in-scene showing number of active sessions.

Characters (one per roster entry, deterministic look from hash of id):
- Chibi iso sprite in SVG: head, hair (style from hash), body/shirt, legs. **Shirt color by provider**
  (anthropic = warm clay #D97757, openai/openai-codex = teal #10A37F, deepseek & openrouter-deepseek = blue
  #4D6BFE, google = #4285F4, xai = near-black, other = hash hue). Skin/hair from hash palette.
  Small name tag under feet (display name). Level badge.
- **Idle (lounge):** seated, holding a mug, steam wisps rising, occasional sip (raise mug) at random offsets,
  slight breathing bob. Some read a magazine / look at phone for variety (deterministic by hash).
- **Working:** walk (tween along grid path, simple L-shaped path, ~1.5s) from lounge seat to the nearest free
  desk slot (hot desking: no fixed desk; stable assignment while working = first free slot by desk order,
  keep it until idle). Seated typing animation (hands bob), monitor lit. Speech bubble above head:
  `thinking` → animated "…" ; `tool` → icon + tool name (bash ▶, read 📖, edit ✏️, write 📝, web_search 🔎,
  fetch_content 🌐, mcp__* → 🧩 + short name after last `__`, other ⚙️). Show project basename small under bubble.
  If a model has >1 active sessions, badge "×N".
- **Done:** walk back to its lounge seat, pick mug up again.
- New model appearing for the first time: walks in from the door with a small "New hire!" confetti.

HUD (NativeWind, overlay, mobile-friendly, dark glassy cards):
- Top bar: "Pi Office" title, live dot (green when SSE connected), status line: "All quiet — coffee break ☕" or
  "N at work".
- Bottom/side roster strip: characters with avatar color, name, title + level progress bar, today's tokens.
- Tap a character (in scene or roster) → read-only card: display name, provider, level/title/XP bar, lifetime
  messages, output tokens, tool calls, sessions, first/last seen, current activity. Close button. No actions.
- Empty state if roster empty.

Client data: `useOffice()` loads `GET /api/office`, then subscribes to `/api/stream` via `EventSource` when
available (web); otherwise polls every 3s (native). API base = `process.env.EXPO_PUBLIC_OFFICE_API ?? ''`
(same origin on web). Reconnect with backoff. Characters animate between states client-side; the server only
sends state.

## Quality bar

- `npm run check` = typecheck (`tsc --noEmit`) + `node --test server/tests/*.test.ts` + `npx expo export -p web`.
- Server tests cover: line parsing, status reducer table above, stale timeout, roster dedupe, display names, level
  math, snapshot build, that no content strings (message text, session_info name, tool args) appear in output.
- Server memory: keep only per-session small state + per-character aggregates + dedupe key set.
- 60fps not required; keep the tick ≤ 20fps and pause when the tab is hidden.

## Deploy

`scripts/install-local.sh`: `npm run build` (expo export web → `dist/`), write
`~/.config/systemd/user/pi-office.service` (HOST=127.0.0.1, PORT=6702, `ExecStart=<node> server/index.ts`,
`WorkingDirectory=<repo>`, Restart=always), daemon-reload, enable, restart. Mirror pi-stats' script.
Then `cfexpose add office 6702 public` (orchestrator does this).
