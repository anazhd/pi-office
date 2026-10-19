import type { ReactNode } from 'react'
import type { Bounds3 } from './depth'

/**
 * One drawable in the scene. `bounds` (grid footprint + pixel height) drives the isometric
 * painter ordering in depth.ts.
 * `after` lists keys of items drawn before this one regardless of geometry (a seat's own
 * furniture for the character sitting in it).
 */
export type SceneItem = {
  key: string
  bounds: Bounds3
  after?: readonly string[]
  node: ReactNode
}
