import type { Character, OfficeSnapshot } from '../../shared/office-types.ts'
import { clamp, type Point } from './iso.ts'
import {
  buildPath,
  buildRetargetPath,
  deskSeatFor,
  DESK_CAPACITY,
  DOOR,
  loungeSeatFor,
  pathLength,
  pointAlong,
  standingSeatFor,
  type Seat,
} from './layout.ts'

/**
 * The four iso-facing variants: front variants show the face for travel toward the viewer
 * (+gx/+gy on screen), back variants show the back of the head for travel away from it.
 */
export type Heading = 'front-left' | 'front-right' | 'back-left' | 'back-right'

export type Plan = {
  char: Character
  seat: Seat
  deskIndex: number | null
  path: Point[]
  walkStart: number
  walkDuration: number
  enteredAt: number
  isNew: boolean
}

export type PlannerState = {
  plans: Map<string, Plan>
  /** character id -> hot-desk index, exactly as the server's snapshot assigned it (never chosen here). */
  desks: Map<string, number>
  /** character id -> sticky lounge-seat index, kept across desk trips. */
  lounges: Map<string, number>
  /** Every character ever seen, so a returning character is not a "new hire". */
  seen: Set<string>
  loaded: boolean
  /** Bounded clock-based retry after a blocked route, even without server changes. */
  retryAt: number | null
  lastSnapshot: OfficeSnapshot | null
}

export type PlanPosition = {
  gx: number
  gy: number
  progress: number
  /** Distance walked along the current path, in tiles. */
  strideTiles: number
  heading: Heading
  walking: boolean
  /** Distance along the path in tiles (same as strideTiles when walking, 0 otherwise). */
  distance: number
}

/** ~1.7 tiles/s: a believable stroll between the lounge and the desks. */
export const WALK_MS_PER_TILE = 600
/** Short hops still read as walking, and long cross-office trips must not be rushed. */
export const WALK_MIN_MS = 1500
export const WALK_MAX_MS = 12_000

export function initialPlannerState(): PlannerState {
  return {
    plans: new Map(),
    desks: new Map(),
    lounges: new Map(),
    seen: new Set(),
    loaded: false,
    retryAt: null,
    lastSnapshot: null,
  }
}

/**
 * Distance easing along a path: constant speed in the middle, a short ease in the first and
 * last ~0.3 tile. `u` is the linear time fraction, `len` the path length in tiles.
 */
export function walkEase(u: number, len: number): number {
  const t = clamp(u, 0, 1)
  if (t <= 0) return 0
  if (t >= 1) return 1
  const a = Math.min(0.25, 0.3 / Math.max(len, 0.001))
  if (a <= 0) return t
  const k = 1 / (1 - a)
  if (t < a) return (k * t * t) / (2 * a)
  if (t > 1 - a) return 1 - (k * (1 - t) * (1 - t)) / (2 * a)
  return k * (t - a / 2)
}

/** Classify a grid-space direction into one of the four iso-facing variants. */
export function headingFor(dir: Point): Heading {
  const screenX = dir.gx - dir.gy
  const screenY = dir.gx + dir.gy
  const awayFromViewer = screenY < 0
  const toLeft = screenX < 0
  if (awayFromViewer) return toLeft ? 'back-left' : 'back-right'
  return toLeft ? 'front-left' : 'front-right'
}

/** A facing only changes for a leg long enough to read as a real direction change. */
export const MIN_HEADING_SEGMENT = 0.4

/**
 * Heading at a distance along a polyline with hysteresis: short corner-cutting legs keep
 * the previous facing instead of making the walker twitch between directions.
 */
export function headingAlongPath(points: Point[], distance: number): Heading {
  if (points.length < 2) return 'front-right'
  const segments: Array<{ dir: Point; len: number }> = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.gx - a.gx, b.gy - a.gy)
    if (len <= 1e-9) continue
    segments.push({ dir: { gx: (b.gx - a.gx) / len, gy: (b.gy - a.gy) / len }, len })
  }
  if (segments.length === 0) return 'front-right'

  let remaining = Math.max(0, distance)
  let index = 0
  for (let i = 0; i < segments.length; i++) {
    index = i
    if (remaining <= segments[i].len || i === segments.length - 1) break
    remaining -= segments[i].len
  }

  if (segments[index].len < MIN_HEADING_SEGMENT) {
    let stable = -1
    for (let i = index - 1; i >= 0; i--) {
      if (segments[i].len >= MIN_HEADING_SEGMENT) {
        stable = i
        break
      }
    }
    if (stable < 0) {
      for (let i = index + 1; i < segments.length; i++) {
        if (segments[i].len >= MIN_HEADING_SEGMENT) {
          stable = i
          break
        }
      }
    }
    if (stable >= 0) index = stable
  }

  return headingFor(segments[index].dir)
}

/** Pure interpolation from a committed plan and the clock. Never mutates the plan. */
export function positionAt(plan: Plan, now: number): PlanPosition {
  const walkLen = plan.path.length > 1 ? pathLength(plan.path) : 0
  const walking = plan.walkDuration > 0 && now < plan.walkStart + plan.walkDuration
  let gx = plan.seat.gx
  let gy = plan.seat.gy
  let progress = 1
  let strideTiles = 0
  let heading: Heading = 'front-right'

  if (walking) {
    progress = clamp((now - plan.walkStart) / plan.walkDuration, 0, 1)
    // Constant ground speed (a short ease only at the ends), so long trips take as long
    // as the distance demands instead of accelerating through the middle.
    const u = walkEase(progress, walkLen)
    strideTiles = walkLen * u
    const p = pointAlong(plan.path, u)
    gx = p.gx
    gy = p.gy
    heading = headingAlongPath(plan.path, strideTiles)
  } else if (plan.path.length > 1) {
    progress = 1
  }

  return { gx, gy, progress, strideTiles, heading, walking, distance: strideTiles }
}

function desksEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false
  for (const [id, desk] of a) if (b.get(id) !== desk) return false
  return true
}

/**
 * Desk index per character from the server's snapshot. The server is the only desk authority: a character
 * without a valid, unclaimed `desk` has none here. A duplicate claim (never sent by the server) is ignored
 * for the later character so one desk is never drawn with two occupants.
 */
export function desksFromSnapshot(snapshot: OfficeSnapshot): Map<string, number> {
  const desks = new Map<string, number>()
  const claimed = new Set<number>()
  for (const char of snapshot.characters) {
    const desk = char.desk
    if (typeof desk !== 'number' || !Number.isInteger(desk) || desk < 0 || desk >= DESK_CAPACITY) continue
    if (claimed.has(desk)) continue
    claimed.add(desk)
    desks.set(char.id, desk)
  }
  return desks
}

function mapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  return desksEqual(a, b)
}

function plansEqual(a: Map<string, Plan>, b: Map<string, Plan>): boolean {
  if (a.size !== b.size) return false
  for (const [id, plan] of a) if (b.get(id) !== plan) return false
  return true
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

/**
 * Pure planner step. Returns `prev` (the same reference) when nothing changed, otherwise a
 * brand-new state whose maps/sets are copy-on-write. Safe to call twice with the same inputs.
 */
export function step(
  prev: PlannerState,
  snapshot: OfficeSnapshot | null,
  now: number,
): PlannerState {
  if (!snapshot) return prev

  // Fast path for ticks between snapshots: plans only change on a server push (desk changes arrive
  // with it) or when a bounded route retry falls due on the clock.
  if (prev.loaded && snapshot === prev.lastSnapshot) {
    if (prev.retryAt == null || now < prev.retryAt) return prev
  }

  let retryAt: number | null = null
  const firstRender = !prev.loaded
  const desks = desksFromSnapshot(snapshot)
  const lounges = new Map(prev.lounges)
  const plans = new Map<string, Plan>()
  const seen = new Set(prev.seen)

  const present = new Set(snapshot.characters.map((c) => c.id))
  for (const id of [...lounges.keys()]) {
    if (!present.has(id)) lounges.delete(id)
  }

  // Sticky lounge seats: only characters without one take the first free index, in
  // roster order. A roster insertion therefore never shifts anyone else's seat.
  const usedLounges = new Set(lounges.values())
  for (const char of snapshot.characters) {
    if (lounges.has(char.id)) continue
    let index = 0
    while (usedLounges.has(index)) index += 1
    lounges.set(char.id, index)
    usedLounges.add(index)
  }

  let waitingCount = 0
  for (let index = 0; index < snapshot.characters.length; index++) {
    const char = snapshot.characters[index]
    const deskIndex = desks.get(char.id) ?? null
    let seat: Seat
    if (deskIndex != null) seat = deskSeatFor(deskIndex)
    else if (char.status !== 'idle') seat = standingSeatFor(waitingCount++)
    else seat = loungeSeatFor(lounges.get(char.id) ?? index)

    const previous = prev.plans.get(char.id)
    const isNew = previous ? previous.isNew : firstRender ? false : !prev.seen.has(char.id)

    let path: Point[] = []
    let walkStart = now
    let walkDuration = 0
    let enteredAt = now
    let plannedSeat = seat
    let plannedDeskIndex = deskIndex

    if (firstRender) {
      // Nobody walks in on the first render: the office is already populated, and each
      // character sits exactly where the server's desk assignment puts it.
      path = []
    } else if (previous) {
      enteredAt = previous.enteredAt
      if (previous.seat.id !== seat.id) {
        const current = positionAt(previous, now)
        const route = current.walking
          ? // Mid-walk retarget: continue/retrace the existing route to a safe junction first.
            buildRetargetPath(
              previous.path,
              { gx: current.gx, gy: current.gy },
              current.distance,
              seat,
              { toKind: seat.kind, toRow: seat.row },
            )
          : buildPath(
              { gx: current.gx, gy: current.gy },
              seat,
              {
                fromKind: previous.seat.kind,
                fromRow: previous.seat.row,
                toKind: seat.kind,
                toRow: seat.row,
              },
            )

        if (route == null) {
          retryAt = now + 1000
          // No verified route. Hold the character where it is (or at its old seat) and do
          // not adopt the unreachable target; the clock retries without a new snapshot.
          plannedDeskIndex = previous.deskIndex
          if (current.walking) {
            plannedSeat = {
              ...previous.seat,
              id: `hold-${char.id}`,
              gx: current.gx,
              gy: current.gy,
            }
            path = [{ gx: current.gx, gy: current.gy }]
          } else {
            plannedSeat = previous.seat
            path = []
          }
          walkStart = now
          walkDuration = 0
        } else {
          path = route
          walkStart = now
          walkDuration = clamp(
            pathLength(path) * WALK_MS_PER_TILE,
            WALK_MIN_MS,
            WALK_MAX_MS,
          )
        }
      } else {
        path = previous.path
        walkStart = previous.walkStart
        walkDuration = previous.walkDuration
      }
    } else {
      const from = isNew ? DOOR : { gx: seat.gx, gy: seat.gy }
      const route = buildPath(from, seat, {
        fromKind: isNew ? 'door' : seat.kind,
        fromRow: isNew ? undefined : seat.row,
        toKind: seat.kind,
        toRow: seat.row,
      })
      if (route == null) {
        retryAt = now + 1000
        plannedSeat = {
          ...seat,
          id: `hold-${char.id}`,
          gx: from.gx,
          gy: from.gy,
        }
        plannedDeskIndex = null
        path = [{ gx: from.gx, gy: from.gy }]
        walkDuration = 0
      } else {
        path = route
        walkDuration = isNew
          ? clamp(pathLength(path) * WALK_MS_PER_TILE, WALK_MIN_MS, WALK_MAX_MS)
          : 0
      }
    }

    plans.set(char.id, {
      char,
      seat: plannedSeat,
      deskIndex: plannedDeskIndex,
      path,
      walkStart,
      walkDuration,
      enteredAt,
      isNew,
    })
    seen.add(char.id)
  }

  // A snapshot whose content is identical produces an equivalent state; keep the old
  // reference when lastSnapshot already matches so render-time memoization stays stable.
  if (
    prev.loaded &&
    snapshot === prev.lastSnapshot &&
    plansEqual(prev.plans, plans) &&
    desksEqual(prev.desks, desks) &&
    mapsEqual(prev.lounges, lounges) &&
    setsEqual(prev.seen, seen)
  ) {
    return prev
  }

  return {
    plans,
    desks,
    lounges,
    seen,
    loaded: true,
    retryAt,
    lastSnapshot: snapshot,
  }
}
