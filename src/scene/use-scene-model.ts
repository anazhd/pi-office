import { useMemo, useRef } from 'react'
import type { Character, OfficeSnapshot } from '@/api/types'
import { clamp, easeInOut } from './iso'
import {
  buildPath,
  deskSeatFor,
  DESK_CAPACITY,
  DOOR,
  loungeSeatFor,
  pathLength,
  pointAlong,
  standingSeatFor,
  type Seat,
} from './layout'

/**
 * seated: idle in the lounge. typing: working at a desk. waiting: working but every desk
 * is taken, so the character stands by the overflow bench instead of pretending to type.
 */
export type CharacterPose = 'seated' | 'walking' | 'typing' | 'waiting'

export type SceneCharacter = {
  char: Character
  seat: Seat
  deskIndex: number | null
  gx: number
  gy: number
  pose: CharacterPose
  walking: boolean
  walkProgress: number
  enteredAt: number
  isNew: boolean
  confetti: boolean
  bubbleLane: number
}

type Plan = {
  char: Character
  seat: Seat
  deskIndex: number | null
  path: { gx: number; gy: number }[]
  walkStart: number
  walkDuration: number
  enteredAt: number
  isNew: boolean
}

const WALK_MS_PER_TILE = 140

/** Stack bubbles so neighbours at the same desk row or standing row do not cover each other. */
function bubbleLaneFor(plan: Plan): number {
  if (plan.deskIndex != null) return plan.deskIndex % 3
  if (plan.seat.kind === 'standing') return Number(plan.seat.id.slice(1)) % 3
  return 0
}

export function useSceneModel(snapshot: OfficeSnapshot | null, now: number): SceneCharacter[] {
  const plansRef = useRef<Map<string, Plan>>(new Map())
  const deskRef = useRef<Map<string, number>>(new Map())
  const posRef = useRef<Map<string, { gx: number; gy: number }>>(new Map())
  const seenRef = useRef<Set<string>>(new Set())
  const loadedRef = useRef(false)
  const lastSnapshotRef = useRef<OfficeSnapshot | null>(null)

  const plans = useMemo(() => {
    if (!snapshot) return plansRef.current
    if (lastSnapshotRef.current === snapshot) return plansRef.current
    lastSnapshotRef.current = snapshot

    const next = new Map<string, Plan>()
    const firstRender = !loadedRef.current
    const deskAssignments = deskRef.current
    const present = new Set(snapshot.characters.map((c) => c.id))
    const active = new Set(
      snapshot.characters.filter((c) => c.status !== 'idle').map((c) => c.id),
    )

    for (const id of [...deskAssignments.keys()]) {
      if (!present.has(id) || !active.has(id)) deskAssignments.delete(id)
    }

    const used = new Set(deskAssignments.values())
    for (const char of snapshot.characters) {
      if (char.status === 'idle' || deskAssignments.has(char.id)) continue
      for (let i = 0; i < DESK_CAPACITY; i++) {
        if (!used.has(i)) {
          deskAssignments.set(char.id, i)
          used.add(i)
          break
        }
      }
    }

    let waitingCount = 0
    for (let index = 0; index < snapshot.characters.length; index++) {
      const char = snapshot.characters[index]
      const deskIndex = deskAssignments.get(char.id) ?? null
      let seat: Seat
      if (deskIndex != null) seat = deskSeatFor(deskIndex)
      else if (char.status !== 'idle') seat = standingSeatFor(waitingCount++)
      else seat = loungeSeatFor(index)
      const previous = plansRef.current.get(char.id)
      const isNew = !firstRender && !seenRef.current.has(char.id)

      let path: Plan['path'] = []
      let walkStart = now
      let walkDuration = 0
      let enteredAt = now

      if (firstRender) {
        path = []
      } else if (previous) {
        if (previous.seat.id !== seat.id) {
          const from = posRef.current.get(char.id) ?? { gx: previous.seat.gx, gy: previous.seat.gy }
          path = buildPath(from, seat, {
            fromKind: previous.seat.kind,
            fromRow: previous.seat.row,
            toKind: seat.kind,
            toRow: seat.row,
          })
          walkDuration = clamp(pathLength(path) * WALK_MS_PER_TILE, 800, 3200)
        } else {
          path = previous.path
          walkStart = previous.walkStart
          walkDuration = previous.walkDuration
          enteredAt = previous.enteredAt
        }
      } else {
        const from = isNew ? DOOR : { gx: seat.gx, gy: seat.gy }
        path = buildPath(from, seat, {
          fromKind: isNew ? 'door' : seat.kind,
          fromRow: isNew ? undefined : seat.row,
          toKind: seat.kind,
          toRow: seat.row,
        })
        walkDuration = isNew ? Math.max(1200, clamp(pathLength(path) * WALK_MS_PER_TILE, 800, 3200)) : 0
      }

      next.set(char.id, {
        char,
        seat,
        deskIndex,
        path,
        walkStart,
        walkDuration,
        enteredAt,
        isNew,
      })
      seenRef.current.add(char.id)
    }

    loadedRef.current = true
    plansRef.current = next
    return next
  }, [snapshot, now])

  return useMemo(() => {
    const out: SceneCharacter[] = []
    for (const plan of plans.values()) {
      const target = plan.seat
      const walking = plan.walkDuration > 0 && now < plan.walkStart + plan.walkDuration
      let gx = target.gx
      let gy = target.gy
      let progress = 1

      if (walking) {
        progress = clamp((now - plan.walkStart) / plan.walkDuration, 0, 1)
        const p = pointAlong(plan.path, easeInOut(progress))
        gx = p.gx
        gy = p.gy
      } else if (plan.path.length > 1) {
        progress = 1
      }

      posRef.current.set(plan.char.id, { gx, gy })

      const working = plan.char.status !== 'idle'
      const pose: CharacterPose = walking
        ? 'walking'
        : working
          ? plan.deskIndex != null
            ? 'typing'
            : 'waiting'
          : 'seated'

      out.push({
        char: plan.char,
        seat: plan.seat,
        deskIndex: plan.deskIndex,
        gx,
        gy,
        pose,
        walking,
        walkProgress: progress,
        enteredAt: plan.enteredAt,
        isNew: plan.isNew,
        confetti: plan.isNew && now < plan.enteredAt + plan.walkDuration + 2400,
        bubbleLane: bubbleLaneFor(plan),
      })
    }
    return out
  }, [plans, now])
}
