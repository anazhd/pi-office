import { iso, type ScreenPoint } from './iso.ts'

export type WindowSpec = { start: number; length: number }
export const RIGHT_WINDOWS: WindowSpec[] = [
  { start: 1.0, length: 2.7 },
  { start: 4.3, length: 2.7 },
  { start: 11.0, length: 2.3 },
]
export const LEFT_WINDOWS: WindowSpec[] = [
  { start: 1.2, length: 2.6 },
  { start: 4.5, length: 2.6 },
  { start: 8.0, length: 1.6 },
]

/** A wall-local horizontal pixel foreshortens; verticals stay vertical.
 * Unlike skewY alone, this is the projection of an orthonormal vertical plane.
 */
export const WALL_AXIS = { x: 2 / Math.sqrt(5), y: 1 / Math.sqrt(5) }
export function rightWallTransform(gx: number, z: number): string {
  const p = iso(gx, 0, z)
  return `matrix(${WALL_AXIS.x} ${WALL_AXIS.y} 0 1 ${p.x} ${p.y})`
}

/** Left (back-left) wall transform: same projection, mirrored along the wall. */
export function leftWallTransform(gy: number, z: number): string {
  const p = iso(0, gy, z)
  return `matrix(${-WALL_AXIS.x} ${WALL_AXIS.y} 0 1 ${p.x} ${p.y})`
}

/** Vertical extent shared by every window opening, in screen pixels above the floor. */
export const WINDOW_SILL_Z = 58
export const WINDOW_TOP_Z = 160
const WINDOW_PANE_H = WINDOW_TOP_Z - WINDOW_SILL_Z
/** One grid unit along a wall is a screen-space vector of length TILE_W/2 * hypot(2, 1). */
export const WALL_UNIT_PX = 16 * Math.sqrt(5)

export type Wall = 'left' | 'right'

export type GlassPane = {
  wall: Wall
  index: number
  /** Polygon points in screen space, for a clip path (top-left, top-right, bottom-right, bottom-left). */
  points: string
  /** Wall matrix whose origin is the pane's top-left corner; local x runs along the wall, y down. */
  transform: string
  /** Pane size in local (wall) pixels; local y runs 0..height top to bottom. */
  width: number
  height: number
  /** Screen-space corners. */
  topLeft: ScreenPoint
  topRight: ScreenPoint
  bottomRight: ScreenPoint
  bottomLeft: ScreenPoint
}

/** The glass of one window, as a clip polygon plus the matrix that draws inside it. */
export function windowGlass(wall: Wall, spec: WindowSpec, index = 0): GlassPane {
  const { start, length } = spec
  const corner = (along: number, z: number) =>
    wall === 'right' ? iso(along, 0, z) : iso(0, along, z)
  const topLeft = corner(start, WINDOW_TOP_Z)
  const topRight = corner(start + length, WINDOW_TOP_Z)
  const bottomRight = corner(start + length, WINDOW_SILL_Z)
  const bottomLeft = corner(start, WINDOW_SILL_Z)
  return {
    wall,
    index,
    points: `${topLeft.x},${topLeft.y} ${topRight.x},${topRight.y} ${bottomRight.x},${bottomRight.y} ${bottomLeft.x},${bottomLeft.y}`,
    transform: wall === 'right' ? rightWallTransform(start, WINDOW_TOP_Z) : leftWallTransform(start, WINDOW_TOP_Z),
    width: length * WALL_UNIT_PX,
    height: WINDOW_PANE_H,
    topLeft,
    topRight,
    bottomRight,
    bottomLeft,
  }
}

/** One celestial body in the shared sky, visible only through this opening. */
export const SKY_ORB_WINDOW = { wall: 'right', index: 0 } as const
/** Where that body sits inside its opening: a fraction along the pane, and a height in pixels. */
export const SKY_ORB = { along: 0.7, z: 132 } as const
/** Night radius of the moon, in screen pixels. */
export const SKY_ORB_NIGHT_RADIUS = 8

/** Screen position of the single sky orb (the moon at night). */
export function skyOrbPoint(): ScreenPoint {
  const spec = RIGHT_WINDOWS[SKY_ORB_WINDOW.index]
  return iso(spec.start + spec.length * SKY_ORB.along, 0, SKY_ORB.z)
}
export const OPS_BOARD = { gx: 9, z: 117, width: 68, height: 78 }

/**
 * Where a season hangs its small wall piece: beside the back corner, ahead of the first window
 * (right windows start at gx 1.0, left ones at gy 1.2) and below the top trim.
 */
export const SEASON_DECOR_ANCHORS = { right: { gx: 0.45, z: 168 }, left: { gy: 0.45, z: 168 } } as const

/**
 * Where the dated Halloween overlay hangs its pieces (see festive-layers.tsx). Appended after the
 * season anchors so the two overlays never fight for the same wall space:
 *
 * - garland: the right-wall pier between the second and third windows (gx 7.0-11.0), strung above
 *   the wall clock (top z 135) and the ops board (top z 156), below the top trim (z 187).
 * - lantern: the narrow left-wall pier between the second and third left windows (gy 7.1-8.0).
 * - cobweb: the top-left corner of a right-wall pane.
 * - moonBat: a screen-pixel offset from the sky orb, so the bat clears the moon itself.
 */
export const HALLOWEEN_ANCHORS = {
  garland: { fromGx: 7.25, toGx: 10.75, z: 182, sag: 9 },
  lantern: { gy: 7.55, z: 122, halfWidth: 9, glowHalfWidth: 15 },
  cobweb: { wall: 'right', index: 1 },
  moonBat: { dx: 12, dy: -7 },
} as const
