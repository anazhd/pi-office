# Pi Office

A read-only, gamified window into Pi. Every model Pi has used is a chibi character in an isometric open-plan
office. When Pi is working with a model, that character walks to a free hot desk, sits down and types; the rest
of the time they are in the lounge with coffee. Tapping a character opens a stat card — there is nothing to
control.

The UI never talks to Pi. It only reads the JSON snapshot produced by the local `server/`, which tails Pi's own
session logs. No prompts, responses, thinking, tool arguments or tool output reach the browser.

## Stack

- Expo SDK 58 (`expo@~58.0.14`), Expo Router, TypeScript
- NativeWind 4 + Tailwind CSS 3.4 for all HUD/card chrome
- `react-native-svg` for the office, furniture and character sprites (works on web, iOS and Android)
- A shared `useTick(20)` clock drives SVG transforms and pauses when the document/app is hidden
- Live data: `GET /api/office` + SSE `GET /api/stream` (EventSource) with backoff and polling fallback on native
- Web output is `single`, so the Node server can serve `dist/` with an SPA fallback

## Develop

```sh
npm install
npm run dev                 # Expo web on :8081, real API at same origin
```

The real API lives on `http://127.0.0.1:6702` and is served by the sibling Node server. During UI work the server
may not be running, so use the fixture:

```sh
EXPO_PUBLIC_OFFICE_MOCK=1 npm run dev
EXPO_PUBLIC_OFFICE_MOCK=1 npm run build
```

The fixture (`src/api/mock.ts`) cycles through four office states every few seconds: quiet lounge, a few models at
work, a busier floor with tool calls, and a second shift. That makes walking, typing, coffee sips and speech
bubbles observable without touching Pi.

For a native build pointed at another host:

```sh
EXPO_PUBLIC_OFFICE_API=https://office.example.com npx expo start
```

## Build, check, deploy

```sh
npm run typecheck     # tsc --noEmit over app/, src/, shared/ and server/
npm run test:server   # node --test server/tests/*.test.ts
npm run build         # expo export -p web -> dist/
npm run check         # typecheck + server tests + web build
sh scripts/install-local.sh   # build + systemd user unit `pi-office` (owned by the server half)
```

The deployed service is `pi-office` on `http://127.0.0.1:6702`, enabled as a systemd user unit and restarted on
failure. Check it with `systemctl --user status pi-office` and `journalctl --user -u pi-office`.

## Layout

```
app/                        Expo Router routes (thin: layout loads fonts, index renders the screen)
src/api/                    fetch client, EventSource + polling hook inputs, mock fixture, shared type re-export
src/hooks/                  useOffice() (live snapshot + connection state), useTick() (paused when hidden)
src/scene/                  iso math, room layout/seats, furniture, chibi sprites, speech bubbles, scene model
src/components/             HUD top bar, roster strip, character card, activity ticker, screen composition
shared/office-types.ts      API contract (types only, shared with server/)
server/, scripts/           read-only data server and systemd installer
```

## The scene

- 2:1 isometric projection, `TILE_W=64`, `TILE_H=32`, floor 14×10 tiles, fixed `viewBox` fitted to the window.
- Painter's algorithm: furniture, characters and chair backs are sorted by `gx + gy` (then depth) so overlaps
  read correctly.
- Two 5-seat bench desks (10 hot desks), lounge for 16 (sofa, armchairs, window bench, ottomans, beanbags,
  cushions), coffee counter, bookshelf, plants, floor lamp, rug, entrance mat.
- Back walls with six windows. The sky tint follows the viewer's local time (day / golden hour / night with moon
  and stars), and warm interior light pools keep the night scene readable.
- Character look is deterministic from the model id: provider shirt colour, hair style/colour, skin, accessories.
  Provider colours follow the spec: Anthropic clay, OpenAI teal, DeepSeek blue, Google blue, xAI near-black.
- Idle: seated, mug in hand, breathing bob, steam, occasional sip, magazine or phone for variety.
- Working: walks the aisle route in ~1–3 s, sits facing the monitor, types, monitor glows with scrolling code,
  speech bubble shows `thinking` dots or the tool icon/name, plus the project basename and a `×N` badge.
- New models walk in from the entrance mat with a little confetti burst.
- Desks are server-owned (see **Hot desks** below): a working model gets a random free desk and keeps it. Lounge seats
  are stable by first-seen order.

## Activity inference

Terminal assistant replies (including errors/aborts) end inferred work; trailing tool results cannot revive them.
Failed tool results also stop inferred work until a new user/assistant continuation. Concurrent sessions are
independent: one failure does not stop another active session of the same model. Errors still count in stats.

Logs do not prove process liveness. Unfinished work expires from the last relevant event timestamp, **not file
mtime**: 10 minutes for thinking, 60 minutes for silent tool execution. Unrelated title/custom updates cannot
renew historical work. T3's embedded Pi workers do not provide verified exact-session process liveness via argv;
no lifecycle hooks are installed. A killed run can remain inferred active until expiry; a tool silent beyond an
hour can be falsely idle. See `SPEC.md`. The server keeps the desk for a 20-second grace after the last activity before the character returns to coffee,
including on errors; working badges clear immediately.

## Hot desks

- The server is the only authority for desk occupancy (`shared/desk-allocation.ts`, applied in `server/sessions.ts`).
  Each snapshot carries every character's `desk` (0–9 or `null`); clients place characters exactly there and never
  choose a desk themselves.
- A working model without a desk takes one of the free desks **at random**. It keeps that desk while it works and for
  a 20-second grace after going idle. Released desks are free for the next assignment; departures never move anyone
  else.
- Capacity: with all 10 desks taken, extra working models wait on the standing spots until a desk is released.
- Persisted in app-owned state, never under `~/.pi`: `$PI_OFFICE_STATE_FILE`, else `~/.local/state/pi-office/desks.json`.
  The file is rewritten only when an assignment changes (temp file + rename). A browser refresh, a reconnect and a
  server restart or deploy therefore leave everyone at their desk. A corrupt or unwritable file starts an empty office
  (with one warning) instead of failing.

## Read-only guarantee

- No inputs write anywhere. The only interaction is selecting a character/roster card (read-only stats).
- The only file the server writes is its own desk-occupancy state (above). Nothing under `~/.pi` is ever written.
- The client only consumes `OfficeSnapshot`; the server strips message text, session names, thinking, tool
  arguments and tool output before sending.
- Card contents: display name, provider/model, level/title/XP, lifetime messages, tokens, tool calls, sessions,
  first/last seen, current sessions (project basename + tool name only).
