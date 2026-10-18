import type { Character, OfficeSnapshot } from '../../shared/office-types.ts'
import { clamp, type Point } from './iso.ts'
import {
  buildPath,
  buildRetargetPath,
  deskSeatFor,
  DESK_CAPACITY,
  directionAlong,
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
  /** character id -> hot-desk index. */
  desks: Map<string, number>
  /** character id -> sticky lounge-seat index, kept across desk trips. */
  lounges: Map<string, number>
  /** character id -> local time at which its reserved desk may be released. */
  graceUntil: Map<string, number>
  /** Every character ever seen, so a returning character is not a "new hire". */
  seen: Set<string>
  loaded: boolean
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
/** Pi goes idle between turns; hold the desk this long before giving it up. */
export const DESK_GRACE_MS = 20_000

export function initialPlannerState(): PlannerState {
  return {
    plans: new Map(),
    desks: new Map(),
    lounges: new Map(),
    graceUntil: new Map(),
    seen: new Set(),
    loaded: false,
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
    // Sample slightly ahead so the walker turns toward the next leg before reaching the corner.
    const lead = walkLen > 0 ? Math.min(1, u + 0.35 / walkLen) : u
    heading = headingFor(directionAlong(plan.path, lead))
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

  // Fast path for ticks between snapshots: plans only change on a server push or when a
  // desk grace window expires on the clock.
  if (prev.loaded && snapshot === prev.lastSnapshot) {
    let expired = false
    for (const expiry of prev.graceUntil.values()) {
      if (now >= expiry) {
        expired = true
        break
      }
    }
    if (!expired) return prev
  }

  const firstRender = !prev.loaded
  const desks = new Map(prev.desks)
  const lounges = new Map(prev.lounges)
  const grace = new Map(prev.graceUntil)
  const plans = new Map<string, Plan>()
  const seen = new Set(prev.seen)

  const present = new Set(snapshot.characters.map((c) => c.id))
  const active = new Set(
    snapshot.characters.filter((c) => c.status !== 'idle').map((c) => c.id),
  )

  for (const id of [...lounges.keys()]) {
    if (!present.has(id)) lounges.delete(id)
  }

  for (const id of [...desks.keys()]) {
    if (!present.has(id)) {
      desks.delete(id)
      grace.delete(id)
      continue
    }
    if (active.has(id)) {
      grace.delete(id)
      continue
    }
    // Idle at a desk: keep the assignment reserved for a grace window so a short pause
    // between Pi turns does not send the worker on a pointless walk to the lounge.
    const expiry = grace.get(id)
    if (expiry == null) {
      grace.set(id, now + DESK_GRACE_MS)
    } else if (now >= expiry) {
      desks.delete(id)
      grace.delete(id)
    }
  }

  const used = new Set(desks.values())
  for (const char of snapshot.characters) {
    if (char.status === 'idle' || desks.has(char.id)) continue
    for (let i = 0; i < DESK_CAPACITY; i++) {
      if (!used.has(i)) {
        desks.set(char.id, i)
        used.add(i)
        break
      }
    }
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

    if (firstRender) {
      // Nobody walks in on the first render: the office is already populated.
      path = []
    } else if (previous) {
      enteredAt = previous.enteredAt
      if (previous.seat.id !== seat.id) {
        const current = positionAt(previous, now)
        if (current.walking) {
          // Mid-walk retarget: continue/retrace the existing route to a safe junction first.
          path = buildRetargetPath(
            previous.path,
            { gx: current.gx, gy: current.gy },
            current.distance,
            seat,
            { toKind: seat.kind, toRow: seat.row },
          )
        } else {
          path = buildPath(
            { gx: current.gx, gy: current.gy },
            seat,
            {
              fromKind: previous.seat.kind,
              fromRow: previous.seat.row,
              toKind: seat.kind,
              toRow: seat.row,
            },
          )
        }
        walkStart = now
        walkDuration = clamp(
          pathLength(path) * WALK_MS_PER_TILE,
          WALK_MIN_MS,
          WALK_MAX_MS,
        )
      } else {
        path = previous.path
        walkStart = previous.walkStart
        walkDuration = previous.walkDuration
      }
    } else {
      const from = isNew ? DOOR : { gx: seat.gx, gy: seat.gy }
      path = buildPath(from, seat, {
        fromKind: isNew ? 'door' : seat.kind,
        fromRow: isNew ? undefined : seat.row,
        toKind: seat.kind,
        toRow: seat.row,
      })
      walkDuration = isNew
        ? clamp(pathLength(path) * WALK_MS_PER_TILE, WALK_MIN_MS, WALK_MAX_MS)
        : 0
    }

    plans.set(char.id, {
      char,
      seat,
      deskIndex,
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
    mapsEqual(prev.graceUntil, grace) &&
    setsEqual(prev.seen, seen)
  ) {
    return prev
  }

  return {
    plans,
    desks,
    lounges,
    graceUntil: grace,
    seen,
    loaded: true,
    lastSnapshot: snapshot,
  }
}
