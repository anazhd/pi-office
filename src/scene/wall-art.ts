import { iso } from './iso.ts'

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

/** One celestial body in the shared sky, visible only through this opening. */
export const SKY_ORB_WINDOW = { wall: 'right', index: 0 } as const
export const OPS_BOARD = { gx: 9, z: 117, width: 68, height: 78 }
