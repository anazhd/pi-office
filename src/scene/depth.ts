import { TILE_H } from './iso.ts'
import type { Box } from './footprints.ts'

/**
 * Isometric painter ordering for axis-aligned boxes.
 *
 * Every drawable carries a `Bounds3`: its floor footprint in grid tiles plus a z range in
 * screen pixels (the same unit furniture.tsx draws in). With the 2:1 projection
 *   screenX = (gx - gy) * 32,  screenY = (gx + gy) * 16 - z
 * a point p lies on the same pixel as q exactly when p = q + (t, t, 32 t) for some t, and p is
 * then closer to the viewer when t > 0. For two boxes A and B the set of such t is an interval
 *   [ max(A.x0-B.x1, A.y0-B.y1, (A.z0-B.z1)/32),  min(A.x1-B.x0, A.y1-B.y0, (A.z1-B.z0)/32) ].
 * Empty: the boxes never overlap on screen, any order is fine. All t > 0: A must draw after B.
 * All t < 0: A must draw before B. Straddling 0: the boxes interpenetrate (a character sitting
 * in a seat), so geometry cannot decide; an explicit `after` hint or the fallback key does.
 *
 * Pairs are turned into a DAG and emitted with a depth-first topological sort, so ordering is
 * exact for every pair that actually overlaps on screen, unlike a single `gx + gy` sort key.
 */
export type Bounds3 = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

export type Sortable = {
  key: string
  bounds: Bounds3
  /** Keys that must be drawn before this item regardless of geometry (a seat's own furniture). */
  after?: readonly string[]
}

/** Pixels of height per tile along the view direction. */
const Z_SCALE = TILE_H
const EPS = 1e-6

export function boundsOf(box: Box, z0 = 0, z1 = 0): Bounds3 {
  return { x0: box.gx, x1: box.gx + box.w, y0: box.gy, y1: box.gy + box.d, z0, z1 }
}

/** A character-sized column: ~0.3 x 0.3 tiles around its feet. */
export function columnAt(gx: number, gy: number, z0: number, z1: number, half = 0.15): Bounds3 {
  return { x0: gx - half, x1: gx + half, y0: gy - half, y1: gy + half, z0, z1 }
}

/**
 * 1 when `a` is closer to the viewer than `b` where they overlap on screen (draw a after b),
 * -1 when `b` is closer, 0 when they never overlap on screen or interpenetrate.
 */
export function isoCompare(a: Bounds3, b: Bounds3): -1 | 0 | 1 {
  const lo = Math.max(a.x0 - b.x1, a.y0 - b.y1, (a.z0 - b.z1) / Z_SCALE)
  const hi = Math.min(a.x1 - b.x0, a.y1 - b.y0, (a.z1 - b.z0) / Z_SCALE)
  if (hi - lo <= EPS) return 0
  if (lo >= -EPS) return 1
  if (hi <= EPS) return -1
  return 0
}

/** True when two boxes overlap in 3D (not merely touching). */
export function interpenetrate(a: Bounds3, b: Bounds3): boolean {
  return (
    Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > EPS &&
    Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > EPS &&
    Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > EPS
  )
}

/** Fallback painter key: the box centre along the view diagonal, then height. */
export function fallbackKey(b: Bounds3): number {
  return (b.x0 + b.x1 + b.y0 + b.y1) / 2 + (b.z0 + b.z1) / (2 * Z_SCALE) * 0.01
}

/**
 * Back-to-front order. Returns the indices of `items` in draw order. Deterministic: ties and
 * cycles resolve by the fallback key, then by key string.
 */
export function sortBackToFront<T extends Sortable>(items: readonly T[]): T[] {
  const n = items.length
  const base = items
    .map((item, index) => ({ index, k: fallbackKey(item.bounds), key: item.key }))
    .sort((a, b) => a.k - b.k || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  const indexByKey = new Map<string, number>()
  items.forEach((item, i) => indexByKey.set(item.key, i))

  // behind[i] = items that must be drawn before i
  const behind: number[][] = Array.from({ length: n }, () => [])
  const forced = new Set<number>()
  items.forEach((item, i) => {
    for (const key of item.after ?? []) {
      const j = indexByKey.get(key)
      if (j == null || j === i) continue
      behind[i].push(j)
      forced.add(j * n + i)
      forced.add(i * n + j)
    }
  })

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (forced.has(i * n + j)) continue
      const rel = isoCompare(items[i].bounds, items[j].bounds)
      if (rel > 0) behind[i].push(j)
      else if (rel < 0) behind[j].push(i)
    }
  }

  const rank = new Int32Array(n)
  base.forEach((entry, r) => {
    rank[entry.index] = r
  })
  for (const list of behind) list.sort((a, b) => rank[a] - rank[b])

  const state = new Uint8Array(n)
  const out: T[] = []
  const stack: Array<{ node: number; next: number }> = []
  for (const { index: root } of base) {
    if (state[root] !== 0) continue
    stack.push({ node: root, next: 0 })
    state[root] = 1
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      const deps = behind[top.node]
      if (top.next < deps.length) {
        const dep = deps[top.next++]
        if (state[dep] === 0) {
          state[dep] = 1
          stack.push({ node: dep, next: 0 })
        }
        continue
      }
      state[top.node] = 2
      out.push(items[top.node])
      stack.pop()
    }
  }
  return out
}

/**
 * Pairs whose final order contradicts `isoCompare`. Used by tests (and for debugging): a
 * well-formed scene has none, because the sort honours every pairwise constraint it can.
 */
export function orderViolations<T extends Sortable>(ordered: readonly T[]): Array<[string, string]> {
  const forced = new Set<string>()
  for (const item of ordered) for (const key of item.after ?? []) forced.add(`${item.key}|${key}`)
  const out: Array<[string, string]> = []
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i]
      const b = ordered[j]
      if (forced.has(`${a.key}|${b.key}`) || forced.has(`${b.key}|${a.key}`)) continue
      // a is drawn first; it is wrong when a is actually closer than b.
      if (isoCompare(a.bounds, b.bounds) > 0) out.push([a.key, b.key])
    }
  }
  return out
}
