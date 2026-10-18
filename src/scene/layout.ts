import type { Point } from './iso'

export type SeatKind = 'desk' | 'sofa' | 'armchair' | 'beanbag' | 'window' | 'cushion' | 'ottoman'

export type Seat = {
  id: string
  gx: number
  gy: number
  kind: SeatKind
  row?: 1 | 2
  /** Facing direction for sprites that care (desk work faces the monitor). */
  facing: 'up' | 'right' | 'left'
}

export const CORRIDOR_Y = 5.55
export const WEST_AISLE_X = 0.52
export const EAST_AISLE_X = 7.48

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
]

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
  return DESK_SEATS[index % DESK_SEATS.length]
}

type PathOptions = {
  fromKind: SeatKind | 'door'
  fromRow?: 1 | 2
  toKind: SeatKind
  toRow?: 1 | 2
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

  if (opts.fromRow === 1) {
    push(cursor.gx, 2.72)
    push(WEST_AISLE_X, 2.72)
    push(WEST_AISLE_X, CORRIDOR_Y)
  } else {
    push(cursor.gx, CORRIDOR_Y)
  }

  if (opts.toRow === 1) {
    push(WEST_AISLE_X, CORRIDOR_Y)
    push(WEST_AISLE_X, 2.72)
    push(to.gx, 2.72)
    push(to.gx, to.gy)
  } else {
    push(to.gx, CORRIDOR_Y)
    push(to.gx, to.gy)
  }

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

export const DESK_BENCHES = [
  { gx: 0.8, gy: 1.14, w: 6.2, d: 0.7 },
  { gx: 0.8, gy: 3.3, w: 6.2, d: 0.7 },
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
