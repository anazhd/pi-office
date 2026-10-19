import type { Point } from './iso.ts'
import {
  DESK_BENCHES,
  DESK_SEAT_SPECS,
  STATIC_FURNITURE,
  type Box,
} from './footprints.ts'

export type { Box } from './footprints.ts'
export { DESK_BENCHES } from './footprints.ts'
import { OBSTACLES, ownObstacles } from './routing-obstacles.ts'
export { OBSTACLES } from './routing-obstacles.ts'

export type SeatKind =
  | 'desk'
  | 'sofa'
  | 'armchair'
  | 'beanbag'
  | 'window'
  | 'cushion'
  | 'ottoman'
  | 'standing'

/** Grid directions, not camera directions: west is -gx, east is +gx. */
export type SeatedFacing = 'west' | 'east' | 'north' | 'south'

/** Furniture-facing directions; independent of route arrival headings. */
export const LOUNGE_FACING: Readonly<Record<string, SeatedFacing>> = {
  l1: 'east', l2: 'east', l3: 'east',
  l4: 'west', l5: 'west',
  l6: 'east', l7: 'west', l8: 'east', l9: 'west',
  l10: 'south', l11: 'south',
  l12: 'south', l13: 'north',
  l14: 'east', l15: 'north', l16: 'north',
}

export function seatedFacing(seat: Seat): SeatedFacing {
  return LOUNGE_FACING[seat.id] ?? (seat.facing === 'left' ? 'west' : seat.facing === 'up' ? 'north' : 'east')
}

export type Seat = {
  id: string
  gx: number
  gy: number
  kind: SeatKind
  /** Desk rows: 1 and 2 are the two hot-desk benches. (3 is retired; kept only in the type.) */
  row?: 1 | 2 | 3
  /** Facing direction for sprites that care (desk work faces the monitor). */
  facing: 'up' | 'right' | 'left'
}

export const CORRIDOR_Y = 5.5
/** Safe horizontal lane between the two hot-desk benches. */
export const ROW1_LANE_Y = 3.05
export const WEST_AISLE_X = 0.5
export const EAST_AISLE_X = 7.5
/** Walkway column from the entrance up to the corridor. Overflow traffic shares it. */
export const ENTRY_LANE_X = 6.9
/** Open lane across the freed south-west floor (the old third bench row). */
export const OVERFLOW_LANE_Y = 8.6
/** Standing spots for workers beyond desk capacity sit between the benches and the door. */
export const STANDING_LANE_Y = 9.3

export const DESK_SEATS: Seat[] = DESK_SEAT_SPECS.map((seat) => ({
  ...seat,
  kind: 'desk',
}))

/** Total hot-desk capacity (10: two benches of five). Workers beyond this stand at the standing spots. */
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
  { id: 'l13', gx: 11.02, gy: 7.13, kind: 'ottoman', facing: 'left' },
  { id: 'l14', gx: 8.45, gy: 6.85, kind: 'cushion', facing: 'right' },
  { id: 'l15', gx: 8.45, gy: 7.78, kind: 'cushion', facing: 'left' },
  { id: 'l16', gx: 8.45, gy: 8.63, kind: 'cushion', facing: 'left' },
]

export const DOOR: Point = { gx: 6.9, gy: 9.72 }

/*
 * Overflow seating is computed once below from obstacle-free floor points. Keeping the
 * lists bounded means an unexpectedly large roster can never place a character inside a
 * sofa, under a desk, or outside the room.
 */
export function loungeSeatFor(index: number): Seat {
  if (index < LOUNGE_SEATS.length) return LOUNGE_SEATS[index]
  const overflow = index - LOUNGE_SEATS.length
  if (overflow < LOUNGE_OVERFLOW_SPOTS.length) return LOUNGE_OVERFLOW_SPOTS[overflow]
  if (LOUNGE_CROWD_SPOTS.length === 0) {
    return LOUNGE_OVERFLOW_SPOTS[LOUNGE_OVERFLOW_SPOTS.length - 1]
  }
  const crowd = (overflow - LOUNGE_OVERFLOW_SPOTS.length) % LOUNGE_CROWD_SPOTS.length
  return LOUNGE_CROWD_SPOTS[crowd]
}

export function deskSeatFor(index: number): Seat {
  return DESK_SEATS[index]
}

/** Where a working character waits when every desk is taken (south of the overflow bench). */
export function standingSeatFor(index: number): Seat {
  if (index < STANDING_OVERFLOW_SPOTS.length) return STANDING_OVERFLOW_SPOTS[index]
  if (STANDING_CROWD_SPOTS.length === 0) {
    return STANDING_OVERFLOW_SPOTS[STANDING_OVERFLOW_SPOTS.length - 1]
  }
  const crowd = (index - STANDING_OVERFLOW_SPOTS.length) % STANDING_CROWD_SPOTS.length
  return STANDING_CROWD_SPOTS[crowd]
}

/**
 * Every seat has an explicit approach portal in a clear lane. The short leg from the
 * portal to the seat (and back) is the only place a route may enter that seat's own
 * furniture. Standing spots have no furniture, so their portal is the spot itself.
 */
const SEAT_PORTALS: Record<string, Point> = {
  ...Object.fromEntries(
    DESK_SEATS.map((seat) => [
      seat.id,
      {
        gx: seat.gx,
        gy: seat.row === 1 ? 3.05 : 5.4,
      },
    ]),
  ),
  l1: { gx: 10.23, gy: 5.12 },
  l2: { gx: 10.23, gy: 6.18 },
  l3: { gx: 10.23, gy: 7.24 },
  l4: { gx: 11.9, gy: 5.25 },
  l5: { gx: 11.9, gy: 7.0 },
  l6: { gx: 9.38, gy: 9.04 },
  l7: { gx: 10.45, gy: 9.04 },
  l8: { gx: 11.52, gy: 9.04 },
  l9: { gx: 12.58, gy: 9.04 },
  l10: { gx: 8.12, gy: 1.55 },
  l11: { gx: 9.12, gy: 1.55 },
  l12: { gx: 11.02, gy: 4.1 },
  l13: { gx: 11.02, gy: 7.75 },
  l14: { gx: 7.85, gy: 6.85 },
  l15: { gx: 7.85, gy: 7.78 },
  l16: { gx: 7.85, gy: 8.63 },
}

export function portalForSeat(seat: Seat): Point {
  const known = SEAT_PORTALS[seat.id]
  if (known) return known
  if (seat.kind === 'standing') return { gx: seat.gx, gy: seat.gy }
  const offsets: Point[] = [
    { gx: 0, gy: 0 },
    { gx: 0, gy: 0.8 },
    { gx: 0, gy: -0.8 },
    { gx: 0.8, gy: 0 },
    { gx: -0.8, gy: 0 },
    { gx: 0.8, gy: 0.8 },
    { gx: -0.8, gy: 0.8 },
  ]
  for (const offset of offsets) {
    const candidate = { gx: seat.gx + offset.gx, gy: seat.gy + offset.gy }
    if (!OBSTACLES.some((box) => pointInBox(candidate, box, 0))) return candidate
  }
  return { gx: seat.gx, gy: seat.gy }
}

/** Furniture a seat belongs to; only its own sit-down/stand-up leg may cross these. */
export function seatOwnFootprints(seat: Seat): Box[] {
  const deskIndex = seat.kind === 'desk'
    ? DESK_SEATS.findIndex((candidate) => candidate.id === seat.id)
    : null
  return ownObstacles(seat, deskIndex)
}

function pointInBox(p: Point, box: Box, pad = 0): boolean {
  return (
    p.gx >= box.gx - pad &&
    p.gx <= box.gx + box.w + pad &&
    p.gy >= box.gy - pad &&
    p.gy <= box.gy + box.d + pad
  )
}

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

function segmentCrossesAny(a: Point, b: Point, obstacles: Box[], pad = 0): boolean {
  for (const box of obstacles) {
    if (segmentCrossesObstacle(a, b, box, pad)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Lane graph
//
// A fixed grid of clear floor points (0.25 tile apart) covers the office. Every
// grid edge is validated against the shared furniture footprints, and each seat
// portal is connected to nearby clear grid points. The room is tiny, so this is
// built once at module load and Dijkstra runs over it for every route.
// ---------------------------------------------------------------------------

const GRID_STEP = 0.25
const ROUTE_PAD = 0.2

type Edge = { to: number; cost: number }
type GraphNode = { gx: number; gy: number; edges: Edge[] }

const G: GraphNode[] = []
const gridIndex = new Map<string, number>()
const portalIndex = new Map<string, number>()
let gridCount = 0

function key(x: number, y: number): string {
  return `${x.toFixed(3)},${y.toFixed(3)}`
}

function addEdge(a: number, b: number): void {
  const na = G[a]
  const nb = G[b]
  if (!na || !nb) return
  const cost = Math.hypot(nb.gx - na.gx, nb.gy - na.gy)
  if (!na.edges.some((edge) => edge.to === b)) na.edges.push({ to: b, cost })
  if (!nb.edges.some((edge) => edge.to === a)) nb.edges.push({ to: a, cost })
}

for (let x = GRID_STEP; x <= 13.5 + 1e-9; x += GRID_STEP) {
  for (let y = GRID_STEP; y <= 9.5 + 1e-9; y += GRID_STEP) {
    const point = { gx: Number(x.toFixed(3)), gy: Number(y.toFixed(3)) }
    if (OBSTACLES.some((box) => pointInBox(point, box, ROUTE_PAD))) continue
    const index = G.length
    G.push({ gx: point.gx, gy: point.gy, edges: [] })
    gridIndex.set(key(point.gx, point.gy), index)
  }
}

gridCount = G.length

for (let i = 0; i < gridCount; i++) {
  const node = G[i]
  const right = gridIndex.get(key(node.gx + GRID_STEP, node.gy))
  const down = gridIndex.get(key(node.gx, node.gy + GRID_STEP))
  if (right != null) {
    const other = G[right]
    if (!segmentCrossesAny(node, other, OBSTACLES, ROUTE_PAD)) addEdge(i, right)
  }
  if (down != null) {
    const other = G[down]
    if (!segmentCrossesAny(node, other, OBSTACLES, ROUTE_PAD)) addEdge(i, down)
  }
}

const PORTAL_POINTS: Array<{ id: string; point: Point }> = [
  ...DESK_SEATS.map((seat) => ({ id: seat.id, point: portalForSeat(seat) })),
  ...LOUNGE_SEATS.map((seat) => ({ id: seat.id, point: portalForSeat(seat) })),
  { id: 'door', point: DOOR },
]

for (const portal of PORTAL_POINTS) {
  const index = G.length
  G.push({ gx: portal.point.gx, gy: portal.point.gy, edges: [] })
  portalIndex.set(portal.id, index)
}

for (let p = gridCount; p < G.length; p++) {
  const portal = G[p]
  const candidates = Array.from({ length: gridCount }, (_, i) => i)
    .map((i) => ({ i, d: Math.hypot(G[i].gx - portal.gx, G[i].gy - portal.gy) }))
    .filter(({ i }) => !segmentCrossesAny(portal, G[i], OBSTACLES, ROUTE_PAD))
    .sort((a, b) => a.d - b.d)
    .slice(0, 10)
  for (const { i } of candidates) addEdge(p, i)
}

/** Exposed for tests: every edge below is a validated, obstacle-free lane segment. */
export const LANE_GRAPH = {
  nodes: G.map(({ gx, gy }) => ({ gx, gy })),
  edges: G.flatMap((node, i) =>
    node.edges
      .filter((edge) => edge.to > i)
      .map((edge) => ({
        a: { gx: node.gx, gy: node.gy },
        b: { gx: G[edge.to].gx, gy: G[edge.to].gy },
      })),
  ),
}

export const LANE_ROUTE_PAD = ROUTE_PAD

function nearestReachableNode(from: Point, ignored: Box[]): number | null {
  let best: number | null = null
  let bestDistance = Infinity
  for (let i = 0; i < G.length; i++) {
    const node = G[i]
    const distance = Math.hypot(node.gx - from.gx, node.gy - from.gy)
    if (distance >= bestDistance) continue
    const blocked = OBSTACLES.some(
      (box) => !ignored.includes(box) && segmentCrossesObstacle(from, node, box, ROUTE_PAD),
    )
    if (blocked) continue
    best = i
    bestDistance = distance
  }
  return best
}

// ---------------------------------------------------------------------------
// Bounded overflow spots
//
// The fixed lounge seats cover the normal roster. Beyond that, characters sit on
// clear floor in the lounge (cushions/beanbag-like floor spots) and, when every
// desk is taken, stand in the overflow waiting area. Candidates are filtered at
// module load with a character-radius margin, then each selected spot is checked
// against the lane graph so it always has a real walking approach.
// ---------------------------------------------------------------------------

export const SPOT_MARGIN = 0.25

type SpotRegion = { x0: number; x1: number; y0: number; y1: number }

const ROOM_BOUNDS = { minX: 0.3, maxX: 13.7, minY: 0.3, maxY: 9.8 }

function insideRoom(point: Point): boolean {
  return (
    point.gx >= ROOM_BOUNDS.minX &&
    point.gx <= ROOM_BOUNDS.maxX &&
    point.gy >= ROOM_BOUNDS.minY &&
    point.gy <= ROOM_BOUNDS.maxY
  )
}

function onDoorPath(point: Point): boolean {
  if (Math.hypot(point.gx - DOOR.gx, point.gy - DOOR.gy) < 0.65) return true
  return Math.abs(point.gx - DOOR.gx) < 0.55 && point.gy > CORRIDOR_Y
}

function spotDistance(a: Point, b: Point): number {
  return Math.hypot(a.gx - b.gx, a.gy - b.gy)
}

function clearSpotPoint(point: Point): boolean {
  if (!insideRoom(point) || onDoorPath(point)) return false
  if (OBSTACLES.some((box) => pointInBox(point, box, SPOT_MARGIN))) return false
  return nearestReachableNode(point, []) != null
}

function collectSpotCandidates(region: SpotRegion): Point[] {
  const out: Point[] = []
  for (let x = region.x0; x <= region.x1 + 1e-9; x += 0.2) {
    for (let y = region.y0; y <= region.y1 + 1e-9; y += 0.2) {
      const point = { gx: Number(x.toFixed(3)), gy: Number(y.toFixed(3)) }
      if (clearSpotPoint(point)) out.push(point)
    }
  }
  return out
}

function selectSpots(
  candidates: Point[],
  avoid: Point[],
  separation: number,
  limit = Infinity,
): Point[] {
  const out: Point[] = []
  for (const point of candidates) {
    if (out.length >= limit) break
    if (avoid.some((other) => spotDistance(point, other) < separation)) continue
    if (out.some((other) => spotDistance(point, other) < separation)) continue
    out.push(point)
  }
  return out
}

function overflowSeat(
  point: Point,
  kind: SeatKind,
  prefix: string,
  index: number,
  facing: Seat['facing'],
): Seat {
  return { id: `${prefix}${index}`, gx: point.gx, gy: point.gy, kind, facing }
}

const fixedSeatPoints: Point[] = [...LOUNGE_SEATS, ...DESK_SEATS, DOOR].map((seat) => ({
  gx: seat.gx,
  gy: seat.gy,
}))

/**
 * Beyond the two bounded overflow tiers, a large roster reuses a handful of spots with
 * deterministic small offsets. Every offset is re-validated with the same clearance as a
 * normal spot, so a crowd never lands in furniture or outside the room. Characters are
 * ~22px wide (~0.8 tile), so variants closer than CROWD_SEPARATION overlap visibly and
 * are dropped instead of stacked. Once these separated spots are exhausted the seat
 * functions cycle through them (reusing a spot), which is preferable to stacking.
 */
const CROWD_OFFSET = 0.12
const CROWD_SEPARATION = 0.3
const CROWD_OFFSETS: Point[] = [
  { gx: 0, gy: 0 },
  { gx: CROWD_OFFSET, gy: 0 },
  { gx: -CROWD_OFFSET, gy: 0 },
  { gx: 0, gy: CROWD_OFFSET },
  { gx: 0, gy: -CROWD_OFFSET },
]

function crowdVariants(points: Point[], avoid: Point[]): Point[] {
  const out: Point[] = []
  const used = [...avoid]
  for (const point of points) {
    for (const offset of CROWD_OFFSETS) {
      const candidate = {
        gx: Number((point.gx + offset.gx).toFixed(3)),
        gy: Number((point.gy + offset.gy).toFixed(3)),
      }
      if (!insideRoom(candidate) || onDoorPath(candidate)) continue
      if (used.some((other) => spotDistance(candidate, other) < CROWD_SEPARATION)) continue
      if (OBSTACLES.some((box) => pointInBox(candidate, box, SPOT_MARGIN))) continue
      if (nearestReachableNode(candidate, []) == null) continue
      out.push(candidate)
      used.push(candidate)
    }
  }
  return out
}

const loungeCandidates = collectSpotCandidates({ x0: 8.2, x1: 13.6, y0: 2.0, y1: 9.2 })
const loungeBasePoints = selectSpots(loungeCandidates, fixedSeatPoints, 0.8)
const loungeCrowdPoints = crowdVariants(
  selectSpots(loungeCandidates, [...fixedSeatPoints, ...loungeBasePoints], 0.55, 8),
  [...fixedSeatPoints, ...loungeBasePoints],
)

const standingCandidates = collectSpotCandidates({ x0: 0.9, x1: 6.6, y0: 8.0, y1: 9.45 })
const standingBasePoints = selectSpots(
  standingCandidates,
  [...fixedSeatPoints, ...loungeBasePoints],
  0.7,
)
const standingCrowdPoints = crowdVariants(
  selectSpots(
    standingCandidates,
    [...fixedSeatPoints, ...loungeBasePoints, ...standingBasePoints],
    0.4,
    8,
  ),
  [...fixedSeatPoints, ...loungeBasePoints, ...standingBasePoints],
)

export const LOUNGE_OVERFLOW_SPOTS: Seat[] = loungeBasePoints.map((point, index) =>
  overflowSeat(point, 'cushion', 'lx', index, 'right'),
)
export const LOUNGE_CROWD_SPOTS: Seat[] = loungeCrowdPoints.map((point, index) =>
  overflowSeat(point, 'cushion', 'lc', index, 'right'),
)
export const STANDING_OVERFLOW_SPOTS: Seat[] = standingBasePoints.map((point, index) =>
  overflowSeat(point, 'standing', 's', index, 'up'),
)
export const STANDING_CROWD_SPOTS: Seat[] = standingCrowdPoints.map((point, index) =>
  overflowSeat(point, 'standing', 'sc', index, 'up'),
)

/** Separated overflow seats in each tier (every spot is >= CROWD_SEPARATION apart). */
export const SEPARATED_LOUNGE_OVERFLOW_BASE = LOUNGE_OVERFLOW_SPOTS.length
export const SEPARATED_STANDING_OVERFLOW_BASE = STANDING_OVERFLOW_SPOTS.length
/** Real capacity: fixed lounge seats plus both separated overflow tiers. */
export const SEPARATED_LOUNGE_CAPACITY =
  LOUNGE_SEATS.length +
  SEPARATED_LOUNGE_OVERFLOW_BASE +
  LOUNGE_CROWD_SPOTS.length
export const SEPARATED_STANDING_CAPACITY =
  SEPARATED_STANDING_OVERFLOW_BASE + STANDING_CROWD_SPOTS.length

type HeapEntry = { node: number; distance: number }

type SearchResult = { distances: Float64Array; previous: Int32Array }

/** Dijkstra with a small turn penalty so equal-length routes prefer fewer corners. */
function dijkstraSearch(start: number, goal: number | null): SearchResult {
  const distances = new Float64Array(G.length)
  distances.fill(Infinity)
  const previous = new Int32Array(G.length)
  previous.fill(-1)
  const heap: HeapEntry[] = [{ node: start, distance: 0 }]
  distances[start] = 0

  const push = (entry: HeapEntry) => {
    heap.push(entry)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent].distance <= heap[i].distance) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      i = parent
    }
  }

  const pop = (): HeapEntry | undefined => {
    if (heap.length === 0) return undefined
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        const right = left + 1
        let smallest = i
        if (left < heap.length && heap[left].distance < heap[smallest].distance) smallest = left
        if (right < heap.length && heap[right].distance < heap[smallest].distance) smallest = right
        if (smallest === i) break
        ;[heap[smallest], heap[i]] = [heap[i], heap[smallest]]
        i = smallest
      }
    }
    return top
  }

  while (heap.length > 0) {
    const current = pop()!
    if (current.distance > distances[current.node]) continue
    if (goal != null && current.node === goal) break
    for (const edge of G[current.node].edges) {
      let cost = edge.cost
      const parent = previous[current.node]
      if (parent >= 0) {
        const inX = G[current.node].gx - G[parent].gx
        const inY = G[current.node].gy - G[parent].gy
        const outX = G[edge.to].gx - G[current.node].gx
        const outY = G[edge.to].gy - G[current.node].gy
        if (Math.abs(inX * outY - inY * outX) > 1e-9) cost += 0.35
      }
      const next = current.distance + cost
      if (next + 1e-9 < distances[edge.to]) {
        distances[edge.to] = next
        previous[edge.to] = current.node
        push({ node: edge.to, distance: next })
      }
    }
  }

  return { distances, previous }
}

function dijkstra(start: number, goal: number): number[] {
  if (start === goal) return [start]
  const { distances, previous } = dijkstraSearch(start, goal)
  if (!Number.isFinite(distances[goal])) return []
  const path: number[] = []
  for (let at = goal; at !== -1; at = previous[at]) {
    path.push(at)
    if (at === start) break
  }
  return path.reverse()
}

/** Quadrant bucket used by headingFor() in the planner. */
function directionBucket(gx: number, gy: number): number {
  const screenX = gx - gy
  const screenY = gx + gy
  return (screenY < 0 ? 2 : 0) + (screenX < 0 ? 1 : 0)
}

/**
 * Shortest graph path with the number of facing changes as the primary cost and distance
 * as the tie-break. This keeps long walks from zig-zagging through every lane corner.
 */
function turnAwarePath(
  start: number,
  goal: number,
  startDirection?: number,
  goalDirection?: number,
): number[] {
  if (start === goal) return [start]
  const stateCount = G.length * 4
  const startState = stateCount
  const total = stateCount + 1
  const distances = new Float64Array(total)
  distances.fill(Infinity)
  const previous = new Int32Array(total)
  previous.fill(-1)
  const heap: HeapEntry[] = []

  const push = (entry: HeapEntry) => {
    heap.push(entry)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent].distance <= heap[i].distance) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      i = parent
    }
  }

  const pop = (): HeapEntry | undefined => {
    if (heap.length === 0) return undefined
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        const right = left + 1
        let smallest = i
        if (left < heap.length && heap[left].distance < heap[smallest].distance) smallest = left
        if (right < heap.length && heap[right].distance < heap[smallest].distance) smallest = right
        if (smallest === i) break
        ;[heap[smallest], heap[i]] = [heap[i], heap[smallest]]
        i = smallest
      }
    }
    return top
  }

  const TURN_COST = 1000
  distances[startState] = 0
  for (const edge of G[start].edges) {
    const direction = directionBucket(
      G[edge.to].gx - G[start].gx,
      G[edge.to].gy - G[start].gy,
    )
    const state = edge.to * 4 + direction
    const cost = edge.cost + (startDirection != null && direction !== startDirection ? TURN_COST : 0)
    if (cost < distances[state]) {
      distances[state] = cost
      previous[state] = startState
      push({ node: state, distance: cost })
    }
  }

  let goalState = -1
  let goalCost = Infinity
  while (heap.length > 0) {
    const current = pop()!
    if (current.distance > distances[current.node]) continue
    if (current.distance >= goalCost) break
    if (current.node !== startState && Math.floor(current.node / 4) === goal) {
      const direction = current.node % 4
      const finalCost =
        current.distance + (goalDirection != null && direction !== goalDirection ? TURN_COST : 0)
      if (finalCost < goalCost) {
        goalCost = finalCost
        goalState = current.node
      }
      continue
    }
    if (current.node === startState) continue
    const node = Math.floor(current.node / 4)
    const direction = current.node % 4
    for (const edge of G[node].edges) {
      const nextDirection = directionBucket(
        G[edge.to].gx - G[node].gx,
        G[edge.to].gy - G[node].gy,
      )
      const weight = edge.cost + (nextDirection === direction ? 0 : TURN_COST)
      const nextState = edge.to * 4 + nextDirection
      const nextDistance = current.distance + weight
      if (nextDistance + 1e-9 < distances[nextState]) {
        distances[nextState] = nextDistance
        previous[nextState] = current.node
        push({ node: nextState, distance: nextDistance })
      }
    }
  }

  if (goalState < 0) return []
  const path: number[] = []
  for (let state = goalState; state !== -1 && state !== startState; state = previous[state]) {
    path.push(Math.floor(state / 4))
  }
  path.push(start)
  return path.reverse()
}

function pushPoint(points: Point[], point: Point): void {
  const last = points[points.length - 1]
  if (last && Math.abs(last.gx - point.gx) < 1e-6 && Math.abs(last.gy - point.gy) < 1e-6) {
    return
  }
  points.push({ gx: point.gx, gy: point.gy })
}

/** Remove collinear middle points without changing the route's geometry. */
function simplify(points: Point[]): Point[] {
  if (points.length <= 2) return points
  const out: Point[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]
    const b = points[i]
    const c = points[i + 1]
    const cross = (b.gx - a.gx) * (c.gy - b.gy) - (b.gy - a.gy) * (c.gx - b.gx)
    const dot = (b.gx - a.gx) * (c.gx - b.gx) + (b.gy - a.gy) * (c.gy - b.gy)
    if (Math.abs(cross) < 1e-9 && dot >= 0) continue
    out.push(b)
  }
  out.push(points[points.length - 1])
  return out
}

/** A segment is clear when it does not touch any unignored footprint at routing clearance. */
function routeSegmentClear(a: Point, b: Point, ignored: Box[]): boolean {
  const obstacles = ignored.length === 0 ? OBSTACLES : OBSTACLES.filter((box) => !ignored.includes(box))
  return !segmentCrossesAny(a, b, obstacles, LANE_ROUTE_PAD)
}

const MIN_ROUTE_LEG = 0.4

/**
 * Greedy line-of-sight string pulling: from each anchor jump to the farthest later point
 * whose straight segment is clear. The destination portal and sit-down leg are kept.
 */
function smoothRoute(
  points: Point[],
  anchor: number,
  end: number,
  startIgnored: Box[],
): Point[] {
  const out = points.slice(0, anchor + 1)
  let i = anchor
  while (i < end) {
    let chosen = i + 1
    for (let j = end; j > i; j--) {
      if (routeSegmentClear(points[i], points[j], i === anchor ? startIgnored : [])) {
        chosen = j
        break
      }
    }
    out.push(points[chosen])
    i = chosen
  }
  return out
}

/**
 * Shortcut a route through any clear grid node, not just the nodes Dijkstra happened to
 * pick. Distances to the destination keep the greedy jump honest; this is only used when
 * the normal string pull still leaves a needlessly angular route.
 */
function visibilityShortcut(
  anchor: Point,
  destPortal: Point,
  destNode: number,
  firstIgnored: Box[],
): Point[] | null {
  const { distances } = dijkstraSearch(destNode, null)
  const points: Point[] = [{ gx: anchor.gx, gy: anchor.gy }]
  let at = anchor

  for (let guard = 0; guard <= G.length; guard++) {
    const ignored = points.length === 1 ? firstIgnored : []
    if (routeSegmentClear(at, destPortal, ignored)) {
      pushPoint(points, destPortal)
      return points
    }

    let best = -1
    let bestCost = Infinity
    for (let i = 0; i < gridCount; i++) {
      if (!Number.isFinite(distances[i])) continue
      const node = G[i]
      const hop = Math.hypot(node.gx - at.gx, node.gy - at.gy)
      if (hop < 1e-6) continue
      const cost = hop + distances[i]
      if (cost >= bestCost - 1e-9) continue
      if (!routeSegmentClear(at, node, ignored)) continue
      best = i
      bestCost = cost
    }
    if (best < 0) return null
    pushPoint(points, G[best])
    at = G[best]
  }
  return null
}

/**
 * Drop corners that leave a sub-half-tile leg, as long as joining the neighbours stays
 * clear. The final sit-down leg is intentionally exempt.
 */
function pruneShortLegs(points: Point[], portalIndex: number, anchor: number): Point[] {
  const out = points.slice()
  let i = anchor + 1
  while (i < portalIndex && i < out.length - 1) {
    const a = out[i - 1]
    const b = out[i]
    const c = out[i + 1]
    const short = Math.hypot(a.gx - b.gx, a.gy - b.gy) < MIN_ROUTE_LEG ||
      Math.hypot(b.gx - c.gx, b.gy - c.gy) < MIN_ROUTE_LEG
    if (short && routeSegmentClear(a, c, [])) {
      out.splice(i, 1)
      if (i > anchor + 1) i -= 1
      continue
    }
    i += 1
  }
  return out
}

function resolveSeat(point: Point, kind: SeatKind | 'door', row?: 1 | 2 | 3): Seat | null {
  if (kind === 'door') return null
  if (kind === 'desk') {
    return (
      DESK_SEATS.find(
        (seat) =>
          (row == null || seat.row === row) &&
          Math.abs(seat.gx - point.gx) < 0.03 &&
          Math.abs(seat.gy - point.gy) < 0.03,
      ) ?? null
    )
  }
  if (kind === 'standing') {
    return LOUNGE_SEATS.find(
      (seat) => Math.abs(seat.gx - point.gx) < 0.03 && Math.abs(seat.gy - point.gy) < 0.03,
    ) ?? { id: `s-${point.gx}-${point.gy}`, ...point, kind: 'standing', facing: 'up' }
  }
  return (
    LOUNGE_SEATS.find(
      (seat) =>
        seat.kind === kind &&
        Math.abs(seat.gx - point.gx) < 0.03 &&
        Math.abs(seat.gy - point.gy) < 0.03,
    ) ?? { id: `tmp-${point.gx}-${point.gy}`, ...point, kind, facing: 'right' }
  )
}

/**
 * Build a route from the current point to a seat.
 *
 * `fromSeat` is set when the character is standing at (or in) its previous seat: the
 * first leg is then the stand-up leg through that seat's own furniture to its portal.
 * For a mid-walk retarget pass null; the first leg goes to the nearest reachable graph
 * node without obstacle exemptions. Retargets still inside a seat use buildRetargetPath.
 */
export function buildRoute(from: Point, to: Seat, fromSeat?: Seat | null): Point[] | null {
  if (!insideRoom(from) || !insideRoom({ gx: to.gx, gy: to.gy })) return null

  const ownFrom = fromSeat ? seatOwnFootprints(fromSeat) : []
  const ownTo = seatOwnFootprints(to)
  const destPortal = portalForSeat(to)
  const startIgnored = fromSeat ? ownFrom : []

  const raw: Point[] = [{ gx: from.gx, gy: from.gy }]
  let anchor = 0
  let startNode: number | null = null

  if (fromSeat) {
    if (!routeSegmentClear(from, portalForSeat(fromSeat), ownFrom)) return null
    pushPoint(raw, portalForSeat(fromSeat))
    anchor = raw.length - 1
    startNode =
      portalIndex.get(fromSeat.id) ??
      nearestReachableNode(raw[raw.length - 1], startIgnored)
  } else {
    const doorIndex = portalIndex.get('door')
    const atDoor =
      doorIndex != null &&
      Math.abs(G[doorIndex].gx - from.gx) < 1e-6 &&
      Math.abs(G[doorIndex].gy - from.gy) < 1e-6
    startNode = atDoor ? doorIndex! : nearestReachableNode(from, startIgnored)
  }

  const destIndex = portalIndex.get(to.id)
  const destNode = destIndex ?? nearestReachableNode(destPortal, ownTo)

  // Detect an unreachable endpoint before appending the seat. Returning null lets the
  // planner keep the character in place instead of drawing a route through furniture.
  if (startNode == null || destNode == null) return null
  const startDirection =
    fromSeat != null
      ? directionBucket(
          portalForSeat(fromSeat).gx - from.gx,
          portalForSeat(fromSeat).gy - from.gy,
        )
      : undefined
  const sitLegX = to.gx - destPortal.gx
  const sitLegY = to.gy - destPortal.gy
  const goalDirection =
    Math.hypot(sitLegX, sitLegY) > 1e-9 ? directionBucket(sitLegX, sitLegY) : undefined
  const nodePath = turnAwarePath(startNode, destNode, startDirection, goalDirection)
  if (nodePath.length === 0) return null

  for (const index of nodePath) pushPoint(raw, G[index])
  pushPoint(raw, destPortal)
  pushPoint(raw, { gx: to.gx, gy: to.gy })

  // The sit-down/stand-up leg may enter the destination's own furniture, but never
  // anything else.
  if (segmentCrossesAny(destPortal, to, OBSTACLES.filter((box) => !ownTo.includes(box)), ROUTE_PAD)) {
    return null
  }

  let destPortalIndex = raw.length - 1
  for (let i = raw.length - 1; i >= 0; i--) {
    if (
      Math.abs(raw[i].gx - destPortal.gx) < 1e-6 &&
      Math.abs(raw[i].gy - destPortal.gy) < 1e-6
    ) {
      destPortalIndex = i
      break
    }
  }

  const smoothed = smoothRoute(
    raw,
    anchor,
    destPortalIndex,
    anchor === 0 ? startIgnored : [],
  )
  if (destPortalIndex < raw.length - 1) pushPoint(smoothed, raw[raw.length - 1])

  const destinationPortal = destPortalIndex < raw.length - 1 ? smoothed.length - 2 : smoothed.length - 1
  let result = pruneShortLegs(smoothed, destinationPortal, anchor)

  // If the route is still visually choppy, re-route greedily through any visible node.
  const portalInResult = result.findIndex(
    (point) =>
      Math.abs(point.gx - destPortal.gx) < 1e-6 && Math.abs(point.gy - destPortal.gy) < 1e-6,
  )
  let hasShortLeg = false
  if (portalInResult > 0) {
    for (let i = 1; i <= portalInResult; i++) {
      const a = result[i - 1]
      const b = result[i]
      if (Math.hypot(a.gx - b.gx, a.gy - b.gy) < MIN_ROUTE_LEG) {
        hasShortLeg = true
        break
      }
    }
  }
  const stableTurns = (points: Point[]) => {
    const directions = points.slice(1).flatMap((point, i) => {
      const dx = point.gx - points[i].gx
      const dy = point.gy - points[i].gy
      return Math.hypot(dx, dy) >= MIN_ROUTE_LEG ? [directionBucket(dx, dy)] : []
    })
    return directions.slice(1).filter((direction, i) => direction !== directions[i]).length
  }
  if (result.length > 8 || hasShortLeg) {
    const shortcut = visibilityShortcut(
      raw[anchor],
      destPortal,
      destNode,
      anchor === 0 ? startIgnored : [],
    )
    if (shortcut) {
      const combined = raw.slice(0, anchor)
      for (const point of shortcut) pushPoint(combined, point)
      if (destPortalIndex < raw.length - 1) pushPoint(combined, raw[raw.length - 1])
      if (stableTurns(combined) < stableTurns(result) ||
          (stableTurns(combined) === stableTurns(result) && combined.length < result.length)) {
        result = combined
      }
    }
  }

  // Keep protected seat legs, but also consider the turn-aware graph geometry.
  const graphRoute = raw.slice(0, anchor)
  for (const point of simplify(raw.slice(anchor, destPortalIndex + 1))) pushPoint(graphRoute, point)
  if (destPortalIndex < raw.length - 1) pushPoint(graphRoute, raw[raw.length - 1])
  if (graphRoute.length <= 8 && stableTurns(graphRoute) < stableTurns(result)) result = graphRoute
  return result
}

type PathOptions = {
  fromKind: SeatKind | 'door'
  fromRow?: 1 | 2 | 3
  toKind: SeatKind
  toRow?: 1 | 2 | 3
}

/**
 * Backwards-compatible wrapper used by the planner and tests: resolve the origin and
 * destination seats from their points/kinds and route through the lane graph.
 */
export function buildPath(from: Point, to: Point, opts: PathOptions): Point[] | null {
  const fromSeat =
    opts.fromKind === 'door' ? null : resolveSeat(from, opts.fromKind, opts.fromRow)
  const toSeat = resolveSeat(to, opts.toKind, opts.toRow)
  if (!toSeat) return null
  return buildRoute(from, toSeat, fromSeat)
}

/**
 * Build a safe route when a mid-walk character is retargeted. The current point is kept
 * exactly, then the walker joins the lane graph at the nearest reachable node.
 */
export function buildRetargetPath(
  path: Point[],
  current: Point,
  walkedTiles: number,
  to: Point,
  opts: { toKind: SeatKind; toRow?: 1 | 2 | 3 },
): Point[] | null {
  const toSeat = resolveSeat(to, opts.toKind, opts.toRow)
  if (!toSeat) return null
  // Preserve the verified open-side leg while still inside a seat's padded envelope.
  // Never grant a blanket exemption to whatever furniture happens to contain a point.
  if (OBSTACLES.some((box) => pointInBox(current, box, ROUTE_PAD))) {
    for (const seat of [...DESK_SEATS, ...LOUNGE_SEATS]) {
      const portal = portalForSeat(seat)
      const distance = (a: Point, b: Point) => Math.hypot(a.gx - b.gx, a.gy - b.gy)
      const at = (p: Point | undefined, q: Point) => p != null && distance(p, q) < 1e-6
      const onSeatLeg = (p: Point) =>
        Math.abs(distance(p, seat) + distance(p, portal) - distance(seat, portal)) < 1e-6
      const first = path[0] && onSeatLeg(path[0]) && onSeatLeg(current) && at(path[1], portal) &&
        walkedTiles <= distance(path[0], portal) + 1e-6
      const last = at(path.at(-1), seat) && at(path.at(-2), portal) && onSeatLeg(current) &&
        walkedTiles >= pathLength(path) - distance(seat, portal) - 1e-6
      if (!first && !last) continue
      if (!routeSegmentClear(current, portal, seatOwnFootprints(seat))) return null
      const rest = buildRoute(portal, toSeat, null)
      return rest ? [current, ...rest] : null
    }
    return null
  }
  return buildRoute(current, toSeat, null)
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

export const LOUNGE_OBSTACLES: Box[] = STATIC_FURNITURE.filter(
  (box) => !DESK_BENCHES.includes(box),
)
