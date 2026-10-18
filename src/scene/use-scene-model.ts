import { useMemo, useRef } from 'react'
import type { Character, OfficeSnapshot } from '@/api/types'
import { clamp, type Point } from './iso'
import {
  buildPath,
  deskSeatFor,
  DESK_CAPACITY,
  directionAlong,
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
 * relaxing: idle, but still at its desk inside the grace window (leaning back, stretching).
 */
export type CharacterPose = 'seated' | 'walking' | 'typing' | 'waiting' | 'relaxing'

/**
 * The four iso-facing variants: front variants show the face for travel toward the viewer
 * (+gx/+gy on screen), back variants show the back of the head for travel away from it.
 */
export type Heading = 'front-left' | 'front-right' | 'back-left' | 'back-right'

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

type Plan = {
  char: Character
  seat: Seat
  deskIndex: number | null
  path: Point[]
  walkStart: number
  walkDuration: number
  enteredAt: number
  isNew: boolean
}

/** ~1.7 tiles/s: a believable stroll between the lounge and the desks. */
const WALK_MS_PER_TILE = 600
/** Short hops still read as walking, and long cross-office trips must not be rushed. */
const WALK_MIN_MS = 1500
const WALK_MAX_MS = 12_000
/** Pi goes idle between turns; hold the desk this long before giving it up. */
const DESK_GRACE_MS = 20_000

/**
 * Distance easing along a path: constant speed in the middle, a short ease in the first and
 * last ~0.3 tile. `u` is the linear time fraction, `len` the path length in tiles.
 */
export function walkEase(u: number, len: number): number {
  const t = clamp(u, 0, 1)
  if (t <= 0) return 0
  if (t >= 1) return 1
  const a = Math.min(0.25, 0.3 / Math.max(len, 0.001))
  if (a <= 0) return t
  const k = 1 / (1 - a)
  if (t < a) return (k * t * t) / (2 * a)
  if (t > 1 - a) return 1 - (k * (1 - t) * (1 - t)) / (2 * a)
  return k * (t - a / 2)
}

/** Classify a grid-space direction into one of the four iso-facing variants. */
function headingFor(dir: Point): Heading {
  const screenX = dir.gx - dir.gy
  const screenY = dir.gx + dir.gy
  const awayFromViewer = screenY < 0
  const toLeft = screenX < 0
  if (awayFromViewer) return toLeft ? 'back-left' : 'back-right'
  return toLeft ? 'front-left' : 'front-right'
}

/** Stack bubbles so neighbours at the same desk row or standing row do not cover each other. */
function bubbleLaneFor(plan: Plan): number {
  if (plan.deskIndex != null) return plan.deskIndex % 3
  if (plan.seat.kind === 'standing') return Number(plan.seat.id.slice(1)) % 3
  return 0
}

export function useSceneModel(snapshot: OfficeSnapshot | null, now: number): SceneCharacter[] {
  const plansRef = useRef<Map<string, Plan>>(new Map())
  const deskRef = useRef<Map<string, number>>(new Map())
  /** character id -> local time at which its reserved desk may be released. */
  const graceRef = useRef<Map<string, number>>(new Map())
  const posRef = useRef<Map<string, { gx: number; gy: number }>>(new Map())
  const seenRef = useRef<Set<string>>(new Set())
  const loadedRef = useRef(false)

  // Recomputed on every snapshot *and* every tick: the desk grace window expires on the clock,
  // not on server pushes, so a purely snapshot-keyed memo would leave idle workers at the desk.
  const plans = useMemo(() => {
    if (!snapshot) return plansRef.current

    const next = new Map<string, Plan>()
    const firstRender = !loadedRef.current
    const deskAssignments = deskRef.current
    const grace = graceRef.current
    const present = new Set(snapshot.characters.map((c) => c.id))
    const active = new Set(
      snapshot.characters.filter((c) => c.status !== 'idle').map((c) => c.id),
    )

    for (const id of [...deskAssignments.keys()]) {
      if (!present.has(id)) {
        deskAssignments.delete(id)
        grace.delete(id)
        continue
      }
      if (active.has(id)) {
        grace.delete(id)
        continue
      }
      // Idle at a desk: keep the assignment reserved for a grace window so a short pause
      // between Pi turns does not send the worker on a pointless walk to the lounge.
      const expiry = grace.get(id)
      if (expiry == null) {
        grace.set(id, now + DESK_GRACE_MS)
      } else if (now >= expiry) {
        deskAssignments.delete(id)
        grace.delete(id)
      }
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
          walkDuration = clamp(pathLength(path) * WALK_MS_PER_TILE, WALK_MIN_MS, WALK_MAX_MS)
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
        walkDuration = isNew
          ? clamp(pathLength(path) * WALK_MS_PER_TILE, WALK_MIN_MS, WALK_MAX_MS)
          : 0
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
      const walkLen = plan.path.length > 1 ? pathLength(plan.path) : 0
      const walking = plan.walkDuration > 0 && now < plan.walkStart + plan.walkDuration
      let gx = target.gx
      let gy = target.gy
      let progress = 1
      let strideTiles = 0
      let heading: Heading = 'front-right'

      if (walking) {
        progress = clamp((now - plan.walkStart) / plan.walkDuration, 0, 1)
        // Constant ground speed (a short ease only at the ends), so long trips take as long
        // as the distance demands instead of accelerating through the middle.
        const u = walkEase(progress, walkLen)
        strideTiles = walkLen * u
        const p = pointAlong(plan.path, u)
        gx = p.gx
        gy = p.gy
        // Sample slightly ahead so the walker turns toward the next leg before reaching the corner.
        const lead = walkLen > 0 ? Math.min(1, u + 0.35 / walkLen) : u
        heading = headingFor(directionAlong(plan.path, lead))
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
          : plan.deskIndex != null
            ? 'relaxing'
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
        strideTiles,
        heading,
        enteredAt: plan.enteredAt,
        isNew: plan.isNew,
        confetti: plan.isNew && now < plan.enteredAt + plan.walkDuration + 2400,
        bubbleLane: bubbleLaneFor(plan),
      })
    }
    return out
  }, [plans, now])
}
