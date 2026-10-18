export const TILE_W = 64
export const TILE_H = 32
export const ORIGIN_X = 340
export const ORIGIN_Y = 196
export const WALL_H = 192
export const VIEWBOX = '0 0 820 612'

export type Point = { gx: number; gy: number }
export type ScreenPoint = { x: number; y: number }

/** Isometric 2:1 projection. z is in screen pixels (height above the floor). */
export function iso(gx: number, gy: number, z = 0): ScreenPoint {
  return {
    x: (gx - gy) * (TILE_W / 2) + ORIGIN_X,
    y: (gx + gy) * (TILE_H / 2) + ORIGIN_Y - z,
  }
}

export function isoPoints(points: Array<[number, number, number?]>): string {
  return points.map(([gx, gy, z]) => `${iso(gx, gy, z).x},${iso(gx, gy, z).y}`).join(' ')
}

export function floorPolygon(gx: number, gy: number, w: number, d: number): string {
  return isoPoints([
    [gx, gy],
    [gx + w, gy],
    [gx + w, gy + d],
    [gx, gy + d],
  ])
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/** Small stable 32-bit hash for deterministic looks. */
export function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function hashIndex(input: string, salt: number, size: number): number {
  return (hashString(input) + Math.imul(salt + 1, 2654435761)) % size
}
