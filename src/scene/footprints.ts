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
  { gx: 1.0, gy: 6.7, w: 5.75, d: 0.7 },
]

export type DeskSeatSpec = {
  id: string
  gx: number
  gy: number
  row: 1 | 2 | 3
  facing: 'up' | 'right' | 'left'
}

/** Seat centres shared by layout.ts (sprites) and the chair/monitor footprints. */
export const DESK_SEAT_SPECS: DeskSeatSpec[] = [
  { id: 'd1', gx: 1.35, gy: 2.35, row: 1, facing: 'up' },
  { id: 'd2', gx: 2.55, gy: 2.35, row: 1, facing: 'up' },
  { id: 'd3', gx: 3.75, gy: 2.35, row: 1, facing: 'up' },
  { id: 'd4', gx: 4.95, gy: 2.35, row: 1, facing: 'up' },
  { id: 'd5', gx: 6.15, gy: 2.35, row: 1, facing: 'up' },
  { id: 'd6', gx: 1.35, gy: 4.5, row: 2, facing: 'up' },
  { id: 'd7', gx: 2.55, gy: 4.5, row: 2, facing: 'up' },
  { id: 'd8', gx: 3.75, gy: 4.5, row: 2, facing: 'up' },
  { id: 'd9', gx: 4.95, gy: 4.5, row: 2, facing: 'up' },
  { id: 'd10', gx: 6.15, gy: 4.5, row: 2, facing: 'up' },
  { id: 'd11', gx: 1.3, gy: 7.9, row: 3, facing: 'up' },
  { id: 'd12', gx: 2.28, gy: 7.9, row: 3, facing: 'up' },
  { id: 'd13', gx: 3.26, gy: 7.9, row: 3, facing: 'up' },
  { id: 'd14', gx: 4.24, gy: 7.9, row: 3, facing: 'up' },
  { id: 'd15', gx: 5.22, gy: 7.9, row: 3, facing: 'up' },
  { id: 'd16', gx: 6.2, gy: 7.9, row: 3, facing: 'up' },
]

/** The monitor, keyboard and desk clutter move together. The depth includes the keyboard. */
export function deskMonitorBox(seat: Point): Box {
  return { gx: seat.gx - 0.45, gy: seat.gy - 0.86, w: 0.9, d: 0.68 }
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
export const COFFEE_TABLE: Box = { gx: 10.28, gy: 5.58, w: 1.58, d: 1.05 }
export const SIDE_TABLE: Box = { gx: 8.34, gy: 6.55, w: 0.62, d: 0.62 }
export const OTTOMAN_NORTH: Box = { gx: 10.62, gy: 4.44, w: 0.84, d: 0.58 }
export const OTTOMAN_SOUTH: Box = { gx: 10.62, gy: 7.2, w: 0.84, d: 0.58 }
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
  { gx: 9.64, gy: 7.44, w: 0.68, d: 0.56 },
  { gx: 12.84, gy: 7.62, w: 0.68, d: 0.56 },
]

export const FLOOR_LAMP: Box = { gx: 8.28, gy: 4.04, w: 0.28, d: 0.28 }

/** The visible pot is 0.48 tiles wide per unit of render scale. */
function plantBox(cx: number, cy: number, scale: number): Box {
  const size = 0.48 * scale
  return { gx: cx - size / 2, gy: cy - size / 2, w: size, d: size }
}

const PLANT_LOUNGE_CENTRE = { gx: 13.35, gy: 3.05 }
const PLANT_DOOR_CENTRE = { gx: 7.78, gy: 9.22 }
const PLANT_SHELF_CENTRE = { gx: 0.62, gy: 9.28 }
const PLANT_DESK_CENTRE = { gx: 0.55, gy: 6.35 }

export type PlantSpec = { box: Box; seed: number; scale: number }

export const PLANT_SPECS: PlantSpec[] = [
  { box: plantBox(PLANT_LOUNGE_CENTRE.gx, PLANT_LOUNGE_CENTRE.gy, 1.1), seed: 1, scale: 1.1 },
  { box: plantBox(PLANT_DOOR_CENTRE.gx, PLANT_DOOR_CENTRE.gy, 0.9), seed: 2, scale: 0.9 },
  { box: plantBox(PLANT_SHELF_CENTRE.gx, PLANT_SHELF_CENTRE.gy, 0.8), seed: 3, scale: 0.8 },
  { box: plantBox(PLANT_DESK_CENTRE.gx, PLANT_DESK_CENTRE.gy, 0.75), seed: 4, scale: 0.75 },
]

export const PLANT_LOUNGE = PLANT_SPECS[0].box
export const PLANT_DOOR = PLANT_SPECS[1].box
export const PLANT_SHELF = PLANT_SPECS[2].box
export const PLANT_DESK = PLANT_SPECS[3].box

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

/**
 * Routing obstacles: the shared static boxes plus the per-seat monitors and chairs.
 * The array is built from the exact same Box objects furniture.tsx renders.
 */
export const OBSTACLES: Box[] = [...STATIC_FURNITURE, ...DESK_MONITOR_BOXES, ...DESK_CHAIR_BOXES]
