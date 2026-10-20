import { useEffect, useMemo, useState } from 'react'
import type { Character, OfficeSnapshot } from '@/api/types'
import type { Seat } from './layout'
import {
  initialPlannerState,
  poseFor,
  positionAt,
  step,
  type CharacterPose,
  type Heading,
  type Plan,
  type PlannerState,
} from './scene-planner'

export type { CharacterPose, Heading } from './scene-planner'

export type SceneCharacter = {
  char: Character
  seat: Seat
  deskIndex: number | null
  gx: number
  gy: number
  pose: CharacterPose
  walking: boolean
  walkProgress: number
  /** Distance walked along the current path, in tiles. Drives the leg stride so feet never skate. */
  strideTiles: number
  heading: Heading
  enteredAt: number
  isNew: boolean
  confetti: boolean
  bubbleLane: number
}

/** Stack bubbles so neighbours at the same desk row or standing row do not cover each other. */
function bubbleLaneFor(plan: Plan): number {
  if (plan.deskIndex != null) return plan.deskIndex % 3
  if (plan.seat.kind === 'standing') return Number(plan.seat.id.slice(1)) % 3
  return 0
}

export function useSceneModel(snapshot: OfficeSnapshot | null, now: number): SceneCharacter[] {
  // Committed planner state. It is only replaced from an effect after React has committed
  // the render, so an abandoned or replayed render can never reserve a desk or reroute a walk.
  const [committed, setCommitted] = useState<PlannerState>(initialPlannerState)

  // The view can safely run one pure step ahead of the committed state: `step` has no side
  // effects, returns the same reference when nothing changes, and is idempotent.
  const state = useMemo(() => step(committed, snapshot, now), [committed, snapshot, now])

  useEffect(() => {
    if (state !== committed) setCommitted(state)
  }, [state, committed])

  return useMemo(() => {
    const out: SceneCharacter[] = []
    for (const plan of state.plans.values()) {
      const position = positionAt(plan, now)
      const walking = position.walking
      const pose = poseFor(plan, now)

      out.push({
        char: plan.char,
        seat: plan.seat,
        deskIndex: plan.deskIndex,
        gx: position.gx,
        gy: position.gy,
        pose,
        walking,
        walkProgress: position.progress,
        strideTiles: position.strideTiles,
        heading: position.heading,
        enteredAt: plan.enteredAt,
        isNew: plan.isNew,
        confetti:
          plan.isNew && now < plan.enteredAt + plan.walkDuration + 2400,
        bubbleLane: bubbleLaneFor(plan),
      })
    }
    return out
  }, [state, now])
}
