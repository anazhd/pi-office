import type { Point } from './iso.ts'
import {
  DESK_BENCHES,
  DESK_SEAT_SPECS,
  OBSTACLES,
  STATIC_FURNITURE,
  SIDE_TABLE,
  SOFA,
  ARMCHAIR_NORTH,
  ARMCHAIR_SOUTH,
  OTTOMAN_NORTH,
  OTTOMAN_SOUTH,
  WINDOW_BENCH,
  BEANBAGS,
  CUSHIONS,
  deskChairBox,
  type Box,
} from './footprints.ts'

export type { Box } from './footprints.ts'
export { DESK_BENCHES, OBSTACLES } from './footprints.ts'

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

export const CORRIDOR_Y = 5.5
/** Safe horizontal lane between the two hot-desk benches. */
export const ROW1_LANE_Y = 3.05
export const WEST_AISLE_X = 0.5
export const EAST_AISLE_X = 7.5
/** Walkway column from the entrance up to the corridor. Overflow traffic shares it. */
export const ENTRY_LANE_X = 6.9
/** Lane south of the overflow chairs; overflow workers enter and leave their chairs here. */
export const OVERFLOW_LANE_Y = 8.6
/** Standing spots for workers beyond desk capacity. */
export const STANDING_LANE_Y = 9.3

export const DESK_SEATS: Seat[] = DESK_SEAT_SPECS.map((seat) => ({
  ...seat,
  kind: 'desk',
}))

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
        gy: seat.row === 1 ? 3.05 : seat.row === 2 ? 5.4 : 8.6,
      },
    ]),
  ),
  l1: { gx: 8.65, gy: 5.12 },
  l2: { gx: 8.65, gy: 6.18 },
  l3: { gx: 8.65, gy: 7.24 },
  l4: { gx: 13.35, gy: 5.38 },
  l5: { gx: 13.35, gy: 7.12 },
  l6: { gx: 9.38, gy: 8.95 },
  l7: { gx: 10.45, gy: 8.95 },
  l8: { gx: 11.52, gy: 8.95 },
  l9: { gx: 12.58, gy: 8.95 },
  l10: { gx: 8.12, gy: 1.55 },
  l11: { gx: 9.12, gy: 1.55 },
  l12: { gx: 11.02, gy: 4.1 },
  l13: { gx: 11.02, gy: 8.0 },
  l14: { gx: 8.0, gy: 6.85 },
  l15: { gx: 9.98, gy: 8.25 },
  l16: { gx: 13.18, gy: 8.42 },
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
  if (seat.kind === 'desk') return [deskChairBox(seat)]
  if (seat.kind === 'standing') return []
  switch (seat.id) {
    case 'l1':
    case 'l2':
    case 'l3':
      return [SOFA]
    case 'l4':
      return [ARMCHAIR_NORTH]
    case 'l5':
      return [ARMCHAIR_SOUTH]
    case 'l6':
    case 'l7':
    case 'l8':
    case 'l9':
      return BEANBAGS[Number(seat.id.slice(1)) - 6] ? [BEANBAGS[Number(seat.id.slice(1)) - 6]] : []
    case 'l10':
    case 'l11':
      return [WINDOW_BENCH]
    case 'l12':
      return [OTTOMAN_NORTH]
    case 'l13':
      return [OTTOMAN_SOUTH]
    case 'l14':
      return [SIDE_TABLE, CUSHIONS[0]]
    case 'l15':
      return [CUSHIONS[1]]
    case 'l16':
      return [CUSHIONS[2]]
    default:
      return []
  }
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
// A fixed grid of clear floor points (0.5 tile apart) covers the office. Every
// grid edge is validated against the shared furniture footprints, and each seat
// portal is connected to nearby clear grid points. The room is tiny, so this is
// built once at module load and Dijkstra runs over it for every route.
// ---------------------------------------------------------------------------

const GRID_STEP = 0.5
const ROUTE_PAD = 0.06

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
      (box) => !ignored.includes(box) && segmentCrossesObstacle(from, node, box, 0),
    )
    if (blocked) continue
    best = i
    bestDistance = distance
  }
  return best
}

type HeapEntry = { node: number; distance: number }

function dijkstra(start: number, goal: number): number[] {
  if (start === goal) return [start]
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
    if (current.node === goal) break
    for (const edge of G[current.node].edges) {
      const next = current.distance + edge.cost
      if (next + 1e-9 < distances[edge.to]) {
        distances[edge.to] = next
        previous[edge.to] = current.node
        push({ node: edge.to, distance: next })
      }
    }
  }

  if (!Number.isFinite(distances[goal])) return []
  const path: number[] = []
  for (let at = goal; at !== -1; at = previous[at]) {
    path.push(at)
    if (at === start) break
  }
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
 * node, ignoring only furniture the current point is already inside.
 */
export function buildRoute(from: Point, to: Seat, fromSeat?: Seat | null): Point[] {
  const destPortal = portalForSeat(to)
  const startIgnored = fromSeat
    ? seatOwnFootprints(fromSeat)
    : OBSTACLES.filter((box) => pointInBox(from, box, 1e-6))

  const points: Point[] = [{ gx: from.gx, gy: from.gy }]
  let startNode: number | null = null

  if (fromSeat) {
    pushPoint(points, portalForSeat(fromSeat))
    startNode = portalIndex.get(fromSeat.id) ?? nearestReachableNode(points[points.length - 1], startIgnored)
  } else {
    const doorIndex = portalIndex.get('door')
    const atDoor =
      doorIndex != null &&
      Math.abs(G[doorIndex].gx - from.gx) < 1e-6 &&
      Math.abs(G[doorIndex].gy - from.gy) < 1e-6
    startNode = atDoor ? doorIndex! : nearestReachableNode(from, startIgnored)
  }

  const destIndex = portalIndex.get(to.id)
  const destNode =
    destIndex ?? nearestReachableNode(destPortal, seatOwnFootprints(to))

  const nodePath = startNode != null && destNode != null ? dijkstra(startNode, destNode) : []
  for (const index of nodePath) pushPoint(points, G[index])
  pushPoint(points, destPortal)
  pushPoint(points, { gx: to.gx, gy: to.gy })

  // If the graph could not connect (should not happen for this fixed room), keep the
  // route honest: a direct clear line, or the current point only as a last resort.
  if (points.length === 1 && startNode == null) {
    const directIgnored = [...startIgnored, ...seatOwnFootprints(to)]
    if (!segmentCrossesAny(from, to, OBSTACLES.filter((box) => !directIgnored.includes(box)))) {
      pushPoint(points, { gx: to.gx, gy: to.gy })
    }
  }

  return simplify(points)
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
export function buildPath(from: Point, to: Point, opts: PathOptions): Point[] {
  const fromSeat =
    opts.fromKind === 'door' ? null : resolveSeat(from, opts.fromKind, opts.fromRow)
  const toSeat = resolveSeat(to, opts.toKind, opts.toRow)
  if (!toSeat) return [{ gx: from.gx, gy: from.gy }]
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
): Point[] {
  void path
  void walkedTiles
  const toSeat = resolveSeat(to, opts.toKind, opts.toRow)
  if (!toSeat) return [{ gx: current.gx, gy: current.gy }]
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
