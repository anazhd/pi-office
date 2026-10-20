// Which hot desks show a lit monitor and a seated worker. Pure: derived from the planned scene only.
//
// A monitor lights for a `typing` character (working, settled at its server desk). `relaxing` (idle inside the
// grace window) still sits in the chair, so the chair drops its back, but the monitor stays dark.
import type { CharacterPose } from './scene-planner.ts'

export type DeskLightInput = {
  deskIndex: number | null
  pose: CharacterPose
}

export type DeskLights = {
  /** Desk indexes whose monitor is lit (typing). */
  lit: Set<number>
  /** Desk indexes with a worker seated in the chair (typing or relaxing). */
  seated: Set<number>
}

export function deskLights(scenes: readonly DeskLightInput[]): DeskLights {
  const lit = new Set<number>()
  const seated = new Set<number>()
  for (const scene of scenes) {
    if (scene.deskIndex == null || scene.pose === 'walking') continue
    if (scene.pose === 'typing') lit.add(scene.deskIndex)
    if (scene.pose === 'typing' || scene.pose === 'relaxing') seated.add(scene.deskIndex)
  }
  return { lit, seated }
}
