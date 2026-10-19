import type { Point } from './iso.ts'

/**
 * Grid-space footprint (the four floor corners of a piece of furniture).
 * One shared source of truth for both rendering and walk routing.
 */
export type Box = { gx: number; gy: number; w: number; d: number }

/** Desk bench positions. The monitors and chairs are derived from the seat positions below. */
export const DESK_BENCHES: Box[] = [
  { gx: 0.8, gy: 1.14, w: 6.2, d: 0.7 },
  { gx: 0.8, gy: 3.3, w: 6.2, d: 0.7 },
]

export type DeskSeatSpec = {
  id: string
  gx: number
  gy: number
  row: 1 | 2 | 3
  facing: 'up' | 'right' | 'left'
}

/**
 * Seat centres shared by layout.ts (sprites) and the chair/monitor footprints. Desk capacity is
 * 10 (two benches, five seats each). The seat is `DESK_SEAT_GAP` tiles past the bench front edge,
 * so the chair is pushed in against the desk and its back faces the viewer. `row` keeps the
 * `3` variant only so older type unions still compile; no seat uses it.
 */
export const DESK_SEAT_GAP = 0.38

export const DESK_SEAT_SPECS: DeskSeatSpec[] = [0, 1].flatMap((rowIndex) => {
  const bench = DESK_BENCHES[rowIndex]
  return [1.35, 2.55, 3.75, 4.95, 6.15].map((gx, i) => ({
    id: `d${rowIndex * 5 + i + 1}`,
    gx,
    gy: Number((bench.gy + bench.d + DESK_SEAT_GAP).toFixed(3)),
    row: (rowIndex + 1) as 1 | 2,
    facing: 'up' as const,
  }))
})

/**
 * The monitor, keyboard and desk clutter move together. They sit ON the bench top: the box
 * lies fully inside the bench footprint, so nothing hangs past the edge.
 */
export function deskMonitorBox(seat: Point): Box {
  return { gx: seat.gx - 0.5, gy: seat.gy - DESK_SEAT_GAP - 0.68, w: 1.0, d: 0.66 }
}

/** Seat cushion, back and legs; the final sit-down step may enter this box. */
export function deskChairBox(seat: Point): Box {
  return { gx: seat.gx - 0.3, gy: seat.gy - 0.2, w: 0.6, d: 0.52 }
}

/** Per-seat boxes are shared by routing and rendering so the contract cannot drift. */
export const DESK_MONITOR_BOXES: Box[] = DESK_SEAT_SPECS.map((seat) => deskMonitorBox(seat))
export const DESK_CHAIR_BOXES: Box[] = DESK_SEAT_SPECS.map((seat) => deskChairBox(seat))

export const SOFA: Box = { gx: 8.94, gy: 4.62, w: 1.0, d: 3.05 }
export const ARMCHAIR_NORTH: Box = { gx: 12.12, gy: 5.0, w: 1.0, d: 0.86 }
export const ARMCHAIR_SOUTH: Box = { gx: 12.12, gy: 6.74, w: 1.0, d: 0.86 }
export const COFFEE_TABLE: Box = { gx: 10.55, gy: 5.58, w: 1.1, d: 1.05 }
export const SIDE_TABLE: Box = { gx: 8.34, gy: 6.55, w: 0.62, d: 0.62 }
export const OTTOMAN_NORTH: Box = { gx: 10.62, gy: 4.44, w: 0.84, d: 0.58 }
export const OTTOMAN_SOUTH: Box = { gx: 10.62, gy: 6.85, w: 0.84, d: 0.58 }
export const WINDOW_BENCH: Box = { gx: 7.72, gy: 0.72, w: 1.92, d: 0.56 }
export const COFFEE_COUNTER: Box = { gx: 10.3, gy: 0.42, w: 3.1, d: 0.9 }
export const BOOKSHELF: Box = { gx: 0.26, gy: 7.88, w: 0.62, d: 1.55 }

export const BEANBAGS: Box[] = [
  { gx: 9.03, gy: 8.1, w: 0.7, d: 0.7 },
  { gx: 10.1, gy: 8.13, w: 0.7, d: 0.7 },
  { gx: 11.17, gy: 8.1, w: 0.7, d: 0.7 },
  { gx: 12.23, gy: 8.1, w: 0.7, d: 0.7 },
]

export const CUSHIONS: Box[] = [
  { gx: 8.11, gy: 6.57, w: 0.68, d: 0.56 }, // on the side table
  { gx: 8.11, gy: 7.5, w: 0.68, d: 0.56 },
  { gx: 8.11, gy: 8.35, w: 0.68, d: 0.56 },
]

export const FLOOR_LAMP: Box = { gx: 8.28, gy: 4.04, w: 0.28, d: 0.28 }

/** The visible pot is 0.48 tiles wide per unit of render scale. */
function plantBox(cx: number, cy: number, scale: number): Box {
  const size = 0.48 * scale
  return { gx: cx - size / 2, gy: cy - size / 2, w: size, d: size }
}

const PLANT_LOUNGE_CENTRE = { gx: 13.35, gy: 3.05 }
const PLANT_SHELF_CENTRE = { gx: 0.62, gy: 9.28 }

export type PlantSpec = { box: Box; seed: number; scale: number }

export const PLANT_SPECS: PlantSpec[] = [
  { box: plantBox(PLANT_LOUNGE_CENTRE.gx, PLANT_LOUNGE_CENTRE.gy, 1.1), seed: 1, scale: 1.1 },
  { box: plantBox(PLANT_SHELF_CENTRE.gx, PLANT_SHELF_CENTRE.gy, 0.8), seed: 3, scale: 0.8 },
]

export const PLANT_LOUNGE = PLANT_SPECS[0].box
export const PLANT_SHELF = PLANT_SPECS[1].box

export const PLANTS: Box[] = PLANT_SPECS.map((spec) => spec.box)

/** Every static lounge/room piece, in the same form used by buildFurniture(). */
export const STATIC_FURNITURE: Box[] = [
  ...DESK_BENCHES,
  SOFA,
  ARMCHAIR_NORTH,
  ARMCHAIR_SOUTH,
  COFFEE_TABLE,
  SIDE_TABLE,
  OTTOMAN_NORTH,
  OTTOMAN_SOUTH,
  WINDOW_BENCH,
  COFFEE_COUNTER,
  BOOKSHELF,
  ...BEANBAGS,
  ...CUSHIONS,
  FLOOR_LAMP,
  ...PLANTS,
]

/** Renderable furniture boxes, keyed for furniture.tsx. */
export const FURNITURE_FOOTPRINTS = {
  deskBenches: DESK_BENCHES,
  sofa: SOFA,
  armchairNorth: ARMCHAIR_NORTH,
  armchairSouth: ARMCHAIR_SOUTH,
  coffeeTable: COFFEE_TABLE,
  sideTable: SIDE_TABLE,
  ottomanNorth: OTTOMAN_NORTH,
  ottomanSouth: OTTOMAN_SOUTH,
  windowBench: WINDOW_BENCH,
  coffeeCounter: COFFEE_COUNTER,
  bookshelf: BOOKSHELF,
  beanbags: BEANBAGS,
  cushions: CUSHIONS,
  floorLamp: FLOOR_LAMP,
  plants: PLANTS,
  plantSpecs: PLANT_SPECS,
  monitors: DESK_MONITOR_BOXES,
  chairs: DESK_CHAIR_BOXES,
} as const

/** Render spec boxes; routing is derived from the renderer's bounds in routing-obstacles.ts. */
export const FURNITURE_BOXES: Box[] = [...STATIC_FURNITURE, ...DESK_MONITOR_BOXES, ...DESK_CHAIR_BOXES]
