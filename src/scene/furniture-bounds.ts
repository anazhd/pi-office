import { boundsOf, columnAt, interpenetrate, type Bounds3 } from './depth.ts'
import { FURNITURE_FOOTPRINTS as F, SOFA, type Box } from './footprints.ts'

/**
 * 3D sort bounds (footprint + pixel heights) for every drawable in buildFurniture(). The
 * footprints are the shared routing boxes from footprints.ts; heights mirror the art in
 * furniture.tsx. Kept free of React so the depth tests can exercise the exact same data.
 */
export const SOFA_SEGMENTS = 3
/** The sofa arms are 0.22 tiles deep at each end; the three seat slices sit between them. */
export const SOFA_ARM_D = 0.22
export const BENCH_TOP_Z = 33.5
export const CHAIR_TOP_Z = 31
/** Seated side-view heads reach 72 px above the floor (including the raised cushion). */
export const CHARACTER_HEIGHT = 74
export const DESK_WORKER_HEIGHT = 74

export type BoundedKey = { key: string; bounds: Bounds3 }

function inset(box: Box, x0: number, x1: number, y0: number, y1: number): Box {
  return { gx: box.gx + x0, gy: box.gy + y0, w: box.w - x0 - x1, d: box.d - y0 - y1 }
}

export function sofaSliceBounds(index: number): Bounds3 {
  // Arms bracket the run; the slices share the middle so each seat has its own sort slot.
  const run = SOFA.d - 2 * SOFA_ARM_D
  const segD = run / SOFA_SEGMENTS
  return boundsOf(
    { gx: SOFA.gx, gy: SOFA.gy + SOFA_ARM_D + index * segD, w: SOFA.w, d: segD },
    0,
    47,
  )
}

export function sofaArmBounds(end: 'back' | 'front'): Bounds3 {
  const gy = end === 'back' ? SOFA.gy : SOFA.gy + SOFA.d - SOFA_ARM_D
  return boundsOf({ gx: SOFA.gx, gy, w: SOFA.w, d: SOFA_ARM_D }, 0, 45)
}

export function armchairFrontBox(box: Box): Box {
  return inset(box, 0, 0.12, box.d - 0.15, 0)
}

export function furnitureBounds(): BoundedKey[] {
  const out: BoundedKey[] = []
  const add = (key: string, bounds: Bounds3) => out.push({ key, bounds })

  F.deskBenches.forEach((bench, i) => add(`bench-${i}`, boundsOf(bench, 0, BENCH_TOP_Z)))
  F.monitors.forEach((box, i) => add(`monitor-${i}`, boundsOf(box, BENCH_TOP_Z, 70)))
  F.chairs.forEach((box, i) => add(`chair-${i}`, boundsOf(box, 0, CHAIR_TOP_Z)))

  for (let i = 0; i < SOFA_SEGMENTS; i++) add(`sofa-${i}`, sofaSliceBounds(i))
  add('sofa-arm-back', sofaArmBounds('back'))
  add('sofa-arm-front', sofaArmBounds('front'))

  // The armchair back is its own slab on the +gx side; the base stops where it begins.
  const BACK_W = 0.12
  for (const [n, box] of [
    [1, F.armchairNorth],
    [2, F.armchairSouth],
  ] as const) {
    add(`armchair-${n}`, boundsOf(inset(box, 0, BACK_W, 0, 0.15), 0, 42))
    add(`armchair-${n}-front`, boundsOf(armchairFrontBox(box), 20, 42))
    add(`armchair-${n}-back`, boundsOf(inset(box, box.w - BACK_W, 0, 0, 0), 20, 50))
  }

  add('coffee-table', boundsOf(F.coffeeTable, 0, 41))
  add('ottoman-1', boundsOf(F.ottomanNorth, 0, 19))
  add('ottoman-2', boundsOf(F.ottomanSouth, 0, 19))
  add('window-bench', boundsOf(F.windowBench, 0, 23))
  F.beanbags.forEach((box, i) => add(`beanbag-${i + 1}`, boundsOf(box, 0, 16)))
  F.cushions.forEach((box, i) => {
    // cushion 1 rests on the side table (top at z 20.5)
    add(`cushion-${i + 1}`, boundsOf(box, i === 0 ? 20.5 : 0, i === 0 ? 27 : 6))
  })
  // Includes the faint steam above the machine.
  add('coffee-counter', boundsOf(F.coffeeCounter, 0, 75))
  add('bookshelf', boundsOf(F.bookshelf, 0, 92))
  add('floor-lamp', boundsOf(F.floorLamp, 0, 78))
  add('side-table', boundsOf(F.sideTable, 0, 20.5))
  F.plantSpecs.forEach((spec, i) => add(`plant-${i}`, boundsOf(spec.box, 0, 70 * spec.scale)))
  return out
}

/** Lookup of the static bounds by item key (built once; heights never change). */
export const FURNITURE_BOUNDS: ReadonlyMap<string, Bounds3> = new Map(
  furnitureBounds().map((entry) => [entry.key, entry.bounds]),
)

/** Keys of furniture the character's feet are inside (sitting down, standing up, in the seat). */
export function furnitureContaining(gx: number, gy: number): string[] {
  const core = columnAt(gx, gy, 0, CHARACTER_HEIGHT, 0.05)
  const out: string[] = []
  for (const [key, bounds] of FURNITURE_BOUNDS) {
    if (interpenetrate(core, bounds)) out.push(key)
  }
  return out
}

/**
 * Keys of the furniture a seat is part of. A character in a seat is drawn after all of them:
 * its sprite is the thing sitting in that seat, so it may overlap the cushion and back it rests
 * against. Everything else (the table in front, the next sofa slice) orders by geometry.
 */
export function seatFurnitureKeys(seat: { id: string; kind: string }, deskIndex: number | null): string[] {
  if (seat.kind === 'desk') return deskIndex != null ? [`chair-${deskIndex}`] : []
  switch (seat.id) {
    case 'l1':
    case 'l2':
    case 'l3':
      return [`sofa-${Number(seat.id.slice(1)) - 1}`]
    case 'l4':
      return ['armchair-1', 'armchair-1-front', 'armchair-1-back']
    case 'l5':
      return ['armchair-2', 'armchair-2-front', 'armchair-2-back']
    case 'l6':
    case 'l7':
    case 'l8':
    case 'l9':
      return [`beanbag-${Number(seat.id.slice(1)) - 5}`]
    case 'l10':
    case 'l11':
      return ['window-bench']
    case 'l12':
      return ['ottoman-1']
    case 'l13':
      return ['ottoman-2']
    case 'l14':
      return ['side-table', 'cushion-1']
    case 'l15':
      return ['cushion-2']
    case 'l16':
      return ['cushion-3']
    default:
      return []
  }
}

/**
 * Sort bounds for a character: a ~0.3 x 0.3 tile column at its feet, including seated workers.
 */
export function characterBounds(scene: {
  gx: number
  gy: number
  pose: string
  deskIndex: number | null
}): Bounds3 {
  const atDesk =
    scene.deskIndex != null && (scene.pose === 'typing' || scene.pose === 'relaxing')
  return columnAt(scene.gx, scene.gy, 0, atDesk ? DESK_WORKER_HEIGHT : CHARACTER_HEIGHT)
}
