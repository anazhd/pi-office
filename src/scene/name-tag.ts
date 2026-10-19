import type { Seat } from './layout.ts'
import { seatedPose } from './seated-pose.ts'

export const NAME_TAG_HEIGHT = 9.6
export const NAME_TAG_OPACITY = { normal: 0.48, selected: 0.78 }

/** Head-relative overlay placement, including hair, breathing/lean and a small clear gap. */
export function nameTagTop(scene: { pose: string; seat: Seat }): number {
  const upright = ['walking', 'waiting', 'typing', 'relaxing'].includes(scene.pose)
  const headCenter = upright ? -48 : -seatedPose(scene.seat).height - 31
  return headCenter - 23 - 4 - NAME_TAG_HEIGHT
}
