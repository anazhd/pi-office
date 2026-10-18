import type { Point } from './iso.ts'

export type SeatKind =
  | 'desk'
  | 'sofa'
  | 'armchair'
  | 'beanbag'
  | 'window'
  | 'cushion'
  | 'ottoman'
  | 'standing'

export type Seat = {
  id: string
  gx: number
  gy: number
  kind: SeatKind
  /** Desk rows: 1 and 2 are the hot-desk benches, 3 is the overflow bench in the south-west room. */
  row?: 1 | 2 | 3
  /** Facing direction for sprites that care (desk work faces the monitor). */
  facing: 'up' | 'right' | 'left'
}

export const CORRIDOR_Y = 5.55
/** Safe horizontal lane between the two hot-desk benches. */
export const ROW1_LANE_Y = 2.72
export const WEST_AISLE_X = 0.52
export const EAST_AISLE_X = 7.48
/** Walkway column from the entrance up to the corridor. Overflow traffic shares it. */
export const ENTRY_LANE_X = 6.9
/** Lane south of the overflow chairs; overflow workers enter and leave their chairs here. */
export const OVERFLOW_LANE_Y = 8.45
/** Standing spots for workers beyond desk capacity. */
export const STANDING_LANE_Y = 9.3

export const DESK_SEATS: Seat[] = [
  { id: 'd1', gx: 1.35, gy: 2.35, kind: 'desk', row: 1, facing: 'up' },
  { id: 'd2', gx: 2.55, gy: 2.35, kind: 'desk', row: 1, facing: 'up' },
  { id: 'd3', gx: 3.75, gy: 2.35, kind: 'desk', row: 1, facing: 'up' },
  { id: 'd4', gx: 4.95, gy: 2.35, kind: 'desk', row: 1, facing: 'up' },
  { id: 'd5', gx: 6.15, gy: 2.35, kind: 'desk', row: 1, facing: 'up' },
  { id: 'd6', gx: 1.35, gy: 4.5, kind: 'desk', row: 2, facing: 'up' },
  { id: 'd7', gx: 2.55, gy: 4.5, kind: 'desk', row: 2, facing: 'up' },
  { id: 'd8', gx: 3.75, gy: 4.5, kind: 'desk', row: 2, facing: 'up' },
  { id: 'd9', gx: 4.95, gy: 4.5, kind: 'desk', row: 2, facing: 'up' },
  { id: 'd10', gx: 6.15, gy: 4.5, kind: 'desk', row: 2, facing: 'up' },
  // Overflow bench (row 3) along the south-west wall: same monitor/chair geometry as the
  // benches above, so the sprite, screen and chair line up exactly as at the other desks.
  { id: 'd11', gx: 1.3, gy: 7.9, kind: 'desk', row: 3, facing: 'up' },
  { id: 'd12', gx: 2.28, gy: 7.9, kind: 'desk', row: 3, facing: 'up' },
  { id: 'd13', gx: 3.26, gy: 7.9, kind: 'desk', row: 3, facing: 'up' },
  { id: 'd14', gx: 4.24, gy: 7.9, kind: 'desk', row: 3, facing: 'up' },
  { id: 'd15', gx: 5.22, gy: 7.9, kind: 'desk', row: 3, facing: 'up' },
  { id: 'd16', gx: 6.2, gy: 7.9, kind: 'desk', row: 3, facing: 'up' },
]

/** Total hot-desk capacity. Workers beyond this stand at STANDING_SPOTS. */
export const DESK_CAPACITY = DESK_SEATS.length

export const LOUNGE_SEATS: Seat[] = [
  { id: 'l1', gx: 9.55, gy: 5.12, kind: 'sofa', facing: 'right' },
  { id: 'l2', gx: 9.55, gy: 6.18, kind: 'sofa', facing: 'right' },
  { id: 'l3', gx: 9.55, gy: 7.24, kind: 'sofa', facing: 'right' },
  { id: 'l4', gx: 12.62, gy: 5.38, kind: 'armchair', facing: 'left' },
  { id: 'l5', gx: 12.62, gy: 7.12, kind: 'armchair', facing: 'left' },
  { id: 'l6', gx: 9.38, gy: 8.45, kind: 'beanbag', facing: 'right' },
  { id: 'l7', gx: 10.45, gy: 8.48, kind: 'beanbag', facing: 'right' },
  { id: 'l8', gx: 11.52, gy: 8.45, kind: 'beanbag', facing: 'left' },
  { id: 'l9', gx: 12.58, gy: 8.45, kind: 'beanbag', facing: 'left' },
  { id: 'l10', gx: 8.12, gy: 0.98, kind: 'window', facing: 'right' },
  { id: 'l11', gx: 9.12, gy: 0.98, kind: 'window', facing: 'right' },
  { id: 'l12', gx: 11.02, gy: 4.72, kind: 'ottoman', facing: 'right' },
  { id: 'l13', gx: 11.02, gy: 7.48, kind: 'ottoman', facing: 'left' },
  { id: 'l14', gx: 8.45, gy: 6.85, kind: 'cushion', facing: 'right' },
  { id: 'l15', gx: 9.98, gy: 7.72, kind: 'cushion', facing: 'left' },
  { id: 'l16', gx: 13.18, gy: 7.9, kind: 'cushion', facing: 'left' },
]

export const DOOR: Point = { gx: 6.9, gy: 9.72 }

export function loungeSeatFor(index: number): Seat {
  if (index < LOUNGE_SEATS.length) return LOUNGE_SEATS[index]
  const overflow = index - LOUNGE_SEATS.length
  return {
    id: `lx${overflow}`,
    gx: 8.4 + (overflow % 4) * 1.1,
    gy: 3.6 + Math.floor(overflow / 4) * 0.9,
    kind: 'cushion',
    facing: 'right',
  }
}

export function deskSeatFor(index: number): Seat {
  return DESK_SEATS[index]
}

/** Where a working character waits when every desk is taken (south of the overflow bench). */
export function standingSeatFor(index: number): Seat {
  const column = index % 6
  const row = Math.floor(index / 6)
  return {
    id: `s${index}`,
    gx: 1.6 + column * 0.85,
    gy: STANDING_LANE_Y - row * 0.45,
    kind: 'standing',
    facing: 'up',
  }
}

/**
 * Painter depth for a character at a seat. Lounge seats sit on (or in) furniture
 * that spans several tiles, so they need to draw after the whole seat/back piece.
 * Desk workers get a large boost so the next desk row's monitors and chairs cannot
 * cover them; visibility wins over strict isometric ordering.
 */
export function seatDepth(seat: Seat): number {
  return seat.kind === 'desk' ? seat.gx + seat.gy + 7.0 : seat.gx + seat.gy + 2.2
}

type PathOptions = {
  fromKind: SeatKind | 'door'
  fromRow?: 1 | 2 | 3
  toKind: SeatKind
  toRow?: 1 | 2 | 3
}

/**
 * Polyline from a seat out to the corridor (gy = CORRIDOR_Y). Row 1 leaves through the
 * west aisle, overflow and standing spots leave through the entry column, everything
 * else goes straight south to the corridor.
 */
function exitFrom(gx: number, gy: number, kind: SeatKind | 'door', row?: 1 | 2 | 3): Point[] {
  if (kind === 'desk' && row === 1) {
    return [
      { gx, gy: ROW1_LANE_Y },
      { gx: WEST_AISLE_X, gy: ROW1_LANE_Y },
      { gx: WEST_AISLE_X, gy: CORRIDOR_Y },
    ]
  }
  if (kind === 'desk' && row === 3) {
    return [
      { gx, gy: OVERFLOW_LANE_Y },
      { gx: ENTRY_LANE_X, gy: OVERFLOW_LANE_Y },
      { gx: ENTRY_LANE_X, gy: CORRIDOR_Y },
    ]
  }
  if (kind === 'standing') {
    return [
      { gx, gy: STANDING_LANE_Y },
      { gx: ENTRY_LANE_X, gy: STANDING_LANE_Y },
      { gx: ENTRY_LANE_X, gy: CORRIDOR_Y },
    ]
  }
  return [{ gx, gy: CORRIDOR_Y }]
}

/** Same as exitFrom but ordered from the corridor into the seat. */
function entryTo(gx: number, gy: number, kind: SeatKind, row?: 1 | 2 | 3): Point[] {
  if (kind === 'desk' && row === 1) {
    return [
      { gx: WEST_AISLE_X, gy: CORRIDOR_Y },
      { gx: WEST_AISLE_X, gy: ROW1_LANE_Y },
      { gx, gy: ROW1_LANE_Y },
      { gx, gy },
    ]
  }
  if (kind === 'desk' && row === 3) {
    return [
      { gx: ENTRY_LANE_X, gy: CORRIDOR_Y },
      { gx: ENTRY_LANE_X, gy: OVERFLOW_LANE_Y },
      { gx, gy: OVERFLOW_LANE_Y },
      { gx, gy },
    ]
  }
  if (kind === 'standing') {
    return [
      { gx: ENTRY_LANE_X, gy: CORRIDOR_Y },
      { gx: ENTRY_LANE_X, gy: STANDING_LANE_Y },
      { gx, gy: STANDING_LANE_Y },
      { gx, gy },
    ]
  }
  return [
    { gx, gy: CORRIDOR_Y },
    { gx, gy },
  ]
}

/** Route through the west aisle / south corridor so nobody walks through a bench. */
export function buildPath(from: Point, to: Point, opts: PathOptions): Point[] {
  const points: Point[] = [{ gx: from.gx, gy: from.gy }]
  let cursor = points[0]

  const push = (gx: number, gy: number) => {
    if (Math.abs(cursor.gx - gx) < 0.02 && Math.abs(cursor.gy - gy) < 0.02) return
    cursor = { gx, gy }
    points.push(cursor)
  }

  const enters = entryTo(to.gx, to.gy, opts.toKind, opts.toRow)
  const belowDesks = opts.toRow === 3 || opts.toKind === 'standing'

  if (opts.fromKind === 'door' && belowDesks) {
    // Arrivals heading for the south side go straight up the entry column, no corridor detour.
    push(ENTRY_LANE_X, enters[1].gy)
  } else {
    for (const p of exitFrom(from.gx, from.gy, opts.fromKind, opts.fromRow)) push(p.gx, p.gy)
    // Walk along the corridor between the two junctions.
    const junction = enters[0]
    push(junction.gx, CORRIDOR_Y)
  }

  for (const p of enters.slice(1)) push(p.gx, p.gy)
  push(to.gx, to.gy)
  return points
}

export function pathLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].gx - points[i - 1].gx, points[i].gy - points[i - 1].gy)
  }
  return total
}

/** Interpolate a position at distance `t` (0..1) along a polyline. */
export function pointAlong(points: Point[], t: number): Point {
  if (points.length === 0) return { gx: 0, gy: 0 }
  if (points.length === 1) return points[0]
  const clamped = Math.max(0, Math.min(1, t))
  const total = pathLength(points)
  if (total <= 0) return points[points.length - 1]
  let remaining = clamped * total
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.gx - a.gx, b.gy - a.gy)
    if (remaining <= len || i === points.length - 1) {
      const k = len > 0 ? Math.min(1, remaining / len) : 1
      return { gx: a.gx + (b.gx - a.gx) * k, gy: a.gy + (b.gy - a.gy) * k }
    }
    remaining -= len
  }
  return points[points.length - 1]
}

/** Unit direction of the path segment at distance fraction `t` (0..1). */
export function directionAlong(points: Point[], t: number): Point {
  if (points.length < 2) return { gx: 0, gy: 1 }
  const clamped = Math.max(0, Math.min(1, t))
  const total = pathLength(points)
  let remaining = clamped * total
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.gx - a.gx, b.gy - a.gy)
    if (remaining <= len || i === points.length - 1) {
      if (len <= 0) return { gx: 0, gy: 1 }
      return { gx: (b.gx - a.gx) / len, gy: (b.gy - a.gy) / len }
    }
    remaining -= len
  }
  return { gx: 0, gy: 1 }
}

export const DESK_BENCHES = [
  { gx: 0.8, gy: 1.14, w: 6.2, d: 0.7 },
  { gx: 0.8, gy: 3.3, w: 6.2, d: 0.7 },
  { gx: 1.0, gy: 6.7, w: 5.75, d: 0.7 },
]

export const WINDOWS = {
  left: [
    { gx: 0, gy: 1.1, w: 0.02, d: 2.6 },
    { gx: 0, gy: 4.5, w: 0.02, d: 2.6 },
    { gx: 0, gy: 7.8, w: 0.02, d: 2.0 },
  ],
  right: [
    { gx: 1.2, gy: 0, w: 2.7, d: 0.02 },
    { gx: 4.6, gy: 0, w: 2.7, d: 0.02 },
    { gx: 10.9, gy: 0, w: 2.7, d: 0.02 },
  ],
}

export type Box = { gx: number; gy: number; w: number; d: number }

/** Large lounge furniture that routes should not cut through. */
export const LOUNGE_OBSTACLES: Box[] = [
  { gx: 9.1, gy: 4.75, w: 0.9, d: 2.85 }, // sofa row
  { gx: 12.2, gy: 5.0, w: 0.8, d: 0.75 }, // north armchair
  { gx: 12.2, gy: 6.75, w: 0.8, d: 0.75 }, // south armchair
  { gx: 9.0, gy: 8.1, w: 3.9, d: 0.7 }, // beanbag row
  { gx: 10.65, gy: 4.35, w: 0.7, d: 0.75 }, // north ottoman
  { gx: 10.65, gy: 7.1, w: 0.7, d: 0.75 }, // south ottoman
  { gx: 7.8, gy: 0.6, w: 2.2, d: 0.75 }, // window bench
]

export const OBSTACLES: Box[] = [...DESK_BENCHES, ...LOUNGE_OBSTACLES]

/** True when the straight segment a→b touches the axis-aligned box (endpoints included). */
export function segmentCrossesObstacle(a: Point, b: Point, box: Box, pad = 0): boolean {
  const minX = box.gx - pad
  const maxX = box.gx + box.w + pad
  const minY = box.gy - pad
  const maxY = box.gy + box.d + pad
  const dx = b.gx - a.gx
  const dy = b.gy - a.gy
  let t0 = 0
  let t1 = 1

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }

  return (
    clip(-dx, a.gx - minX) &&
    clip(dx, maxX - a.gx) &&
    clip(-dy, a.gy - minY) &&
    clip(dy, maxY - a.gy) &&
    t0 <= t1
  )
}

export function pathCrossesObstacle(points: Point[], obstacles: Box[] = OBSTACLES): boolean {
  for (let i = 1; i < points.length; i++) {
    for (const box of obstacles) {
      if (segmentCrossesObstacle(points[i - 1], points[i], box)) return true
    }
  }
  return false
}

const LANE_EPS = 0.08
const near = (a: number, b: number) => Math.abs(a - b) < LANE_EPS

function isNetworkPoint(p: Point): boolean {
  return (
    near(p.gy, CORRIDOR_Y) ||
    near(p.gy, ROW1_LANE_Y) ||
    near(p.gy, OVERFLOW_LANE_Y) ||
    near(p.gy, STANDING_LANE_Y) ||
    near(p.gx, WEST_AISLE_X) ||
    near(p.gx, EAST_AISLE_X) ||
    near(p.gx, ENTRY_LANE_X)
  )
}

function pointInBox(p: Point, box: Box, pad = 0): boolean {
  return (
    p.gx >= box.gx - pad &&
    p.gx <= box.gx + box.w + pad &&
    p.gy >= box.gy - pad &&
    p.gy <= box.gy + box.d + pad
  )
}

/**
 * Route from a point already on the aisle/corridor network to a seat, using the normal
 * entry rules. Every leg stays on the safe lanes: row-1 lane, west aisle, corridor,
 * overflow lane, standing lane, or the entry column.
 */
export function routeFromNetwork(
  from: Point,
  to: Point,
  toKind: SeatKind,
  toRow?: 1 | 2 | 3,
): Point[] {
  const points: Point[] = [{ gx: from.gx, gy: from.gy }]
  let cursor = points[0]
  const push = (gx: number, gy: number) => {
    if (Math.abs(cursor.gx - gx) < 0.02 && Math.abs(cursor.gy - gy) < 0.02) return
    cursor = { gx, gy }
    points.push(cursor)
  }

  const enters = entryTo(to.gx, to.gy, toKind, toRow)
  const target = enters[0]

  const onVerticalLane =
    near(from.gx, WEST_AISLE_X) || near(from.gx, ENTRY_LANE_X) || near(from.gx, EAST_AISLE_X)

  if (!onVerticalLane && !near(from.gy, CORRIDOR_Y)) {
    if (near(from.gy, OVERFLOW_LANE_Y) || near(from.gy, STANDING_LANE_Y)) {
      push(ENTRY_LANE_X, from.gy)
    } else if (near(from.gy, ROW1_LANE_Y)) {
      push(WEST_AISLE_X, from.gy)
    } else {
      push(from.gx, CORRIDOR_Y)
    }
  }

  if (!near(cursor.gy, CORRIDOR_Y)) push(cursor.gx, CORRIDOR_Y)
  push(target.gx, CORRIDOR_Y)
  for (const p of enters.slice(1)) push(p.gx, p.gy)
  push(to.gx, to.gy)
  return points
}

/**
 * Build a safe route when a mid-walk character is retargeted. Instead of applying the old
 * destination's exit rule from an arbitrary point (which can cut through a bench), follow
 * the remaining path (or reverse the already-walked part) to the nearest network junction,
 * then route from there using the normal entry rules.
 */
export function buildRetargetPath(
  path: Point[],
  current: Point,
  walkedTiles: number,
  to: Point,
  opts: { toKind: SeatKind; toRow?: 1 | 2 | 3 },
): Point[] {
  if (path.length < 2) {
    return routeFromNetwork(current, to, opts.toKind, opts.toRow)
  }

  const distances = [0]
  for (let i = 1; i < path.length; i++) {
    distances.push(
      distances[i - 1] +
        Math.hypot(path[i].gx - path[i - 1].gx, path[i].gy - path[i - 1].gy),
    )
  }
  const total = distances[distances.length - 1]
  const walked = Math.max(0, Math.min(total, walkedTiles))

  let segment = 1
  while (segment < path.length - 1 && walked > distances[segment]) segment += 1

  const ignore = OBSTACLES.filter((box) => !pointInBox(current, box, 0.05))
  let best: Point[] | null = null
  let bestLength = Infinity

  const consider = (prefix: Point[], junction: Point) => {
    const suffix = routeFromNetwork(junction, to, opts.toKind, opts.toRow)
    const candidate: Point[] = []
    let cursor: Point | null = null
    const push = (p: Point) => {
      if (
        cursor &&
        Math.abs(cursor.gx - p.gx) < 0.02 &&
        Math.abs(cursor.gy - p.gy) < 0.02
      ) {
        return
      }
      cursor = p
      candidate.push(p)
    }
    for (const p of prefix) push(p)
    for (const p of suffix) push(p)
    if (pathCrossesObstacle(candidate, ignore)) return
    const length = pathLength(candidate)
    if (length < bestLength) {
      best = candidate
      bestLength = length
    }
  }

  // Forward: continue along the unwalked part of the path to a junction.
  for (let j = segment; j < path.length; j++) {
    if (!isNetworkPoint(path[j])) continue
    const prefix: Point[] = [{ gx: current.gx, gy: current.gy }]
    for (let k = segment; k <= j; k++) prefix.push(path[k])
    consider(prefix, path[j])
  }

  // Reverse: retrace the already-walked part back to a junction.
  for (let j = segment - 1; j >= 0; j--) {
    if (!isNetworkPoint(path[j])) continue
    const prefix: Point[] = [{ gx: current.gx, gy: current.gy }]
    for (let k = segment - 1; k >= j; k--) prefix.push(path[k])
    consider(prefix, path[j])
  }

  if (best) return best

  // No clean candidate (e.g. starting inside lounge furniture): fall back to the nearest
  // corridor point, which is always safe once we are out of the furniture.
  return routeFromNetwork({ gx: current.gx, gy: CORRIDOR_Y }, to, opts.toKind, opts.toRow)
}
