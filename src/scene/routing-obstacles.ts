import { FURNITURE_BOUNDS, seatFurnitureKeys } from './furniture-bounds.ts'
import { FURNITURE_BOXES as FOOTPRINTS, type Box } from './footprints.ts'

/** The renderer's bounds registry is authoritative, including split backs and arms. */
export const ROUTING_ITEMS = [...FURNITURE_BOUNDS].map(([key, b]) => {
  const box = FOOTPRINTS.find(
    (o) =>
      Math.abs(o.gx - b.x0) < 1e-9 &&
      Math.abs(o.gy - b.y0) < 1e-9 &&
      Math.abs(o.w - (b.x1 - b.x0)) < 1e-9 &&
      Math.abs(o.d - (b.y1 - b.y0)) < 1e-9,
  ) ?? { gx: b.x0, gy: b.y0, w: b.x1 - b.x0, d: b.y1 - b.y0 }
  return { key, box }
})
export const OBSTACLES: Box[] = ROUTING_ITEMS.map((item) => item.box)
export function ownObstacles(seat: { id: string; kind: string }, deskIndex: number | null): Box[] {
  const keys = seatFurnitureKeys(seat, deskIndex)
  return ROUTING_ITEMS.filter((item) => keys.includes(item.key)).map((item) => item.box)
}
