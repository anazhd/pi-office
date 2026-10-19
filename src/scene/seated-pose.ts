import { seatedFacing, type Seat } from './layout.ts'

export type Joint = { x: number; y: number; z: number }
/** Furniture heights are pixels; horizontal anatomy is in floor tiles (32:16 projection). */
export function seatedPose(seat: Seat) {
  const facing = seatedFacing(seat)
  const axis = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] }[facing]
  const [dx, dy] = axis
  const height = seat.kind === 'sofa' || seat.kind === 'armchair' ? 25
    : seat.kind === 'window' ? 23 : seat.kind === 'ottoman' ? 19
    : seat.kind === 'beanbag' ? 13 : seat.id === 'l14' ? 27 : 6
  const folded = seat.kind === 'beanbag' || seat.kind === 'cushion'
  const point = (forward: number, across: number, z: number): Joint => {
    const gx = dx * forward - dy * across
    const gy = dy * forward + dx * across
    return { x: (gx - gy) * 32, y: (gx + gy) * 16 - z, z }
  }
  // Rust chairs are deeper than the sofa: the knee must clear their west edge at gx 12.12.
  const reach = seat.kind === 'armchair' ? 0.61 : 0.43
  const legs = [-1, 1].map((side) => ({
    hip: point(0, side * 0.085, height + 1),
    knee: point(folded ? 0.19 : reach, side * (folded ? 0.28 : 0.105), folded ? height : height - 2),
    ankle: point(folded ? 0.29 : reach + 0.03, side * (folded ? -0.10 : 0.105), folded ? height - 1 : 3),
    toe: point(folded ? 0.21 : reach + 0.16, side * (folded ? -0.13 : 0.105), folded ? height - 1 : 2),
  })).sort((a, b) => a.knee.y - b.knee.y)
  return { facing, height, folded, point, hip: point(0, 0, height), legs,
    mirror: dx - dy < 0 ? -1 : 1, back: dx + dy < 0 }
}
