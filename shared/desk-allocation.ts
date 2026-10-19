// Hot-desk occupancy: the single authority for which character holds which desk.
//
// Pure and shared: the server owns the real state (and persists it, see server/desks.ts), the offline mock
// fixture reuses the same rules. No I/O and no clock reads: callers pass `now` and the pick function.
//
// Rules:
//   - A working character without a desk takes one of the free desks, chosen by `pick` (random in production).
//   - A desk holder keeps its desk while it works, and for DESK_GRACE_MS after it goes idle. Working again
//     inside that window resumes at the same desk.
//   - Released desks are free for the next assignment. Holders that left the roster lose their desk at once.
//   - Existing assignments are never moved, so a refresh or a departure cannot reshuffle anyone else.
//   - At most one character per desk, always within 0..DESK_COUNT-1.
import type { OfficeSnapshot } from './office-types.ts'

/** Two 5-seat benches. Must match the client layout's DESK_SEATS (asserted in the scene tests). */
export const DESK_COUNT = 10
/** Pi goes idle between turns; an idle worker keeps its desk this long before giving it up. */
export const DESK_GRACE_MS = 20_000

/** Occupancy state. `assignments` is the persisted part; `idleSince` is runtime-only grace bookkeeping. */
export type DeskPlan = {
  /** character id -> desk index. Each desk index appears at most once. */
  assignments: Map<string, number>
  /** character id -> epoch ms since which this desk holder has been idle. */
  idleSince: Map<string, number>
}

export type DeskCandidate = {
  id: string
  /** True while the character has active sessions (status !== 'idle'). */
  working: boolean
}

/** Chooses one desk from a non-empty, ascending list of free desk indexes. */
export type DeskPick = (free: readonly number[]) => number

export function randomPick(free: readonly number[]): number {
  return free[Math.floor(Math.random() * free.length)]
}

export function emptyDeskPlan(): DeskPlan {
  return { assignments: new Map(), idleSince: new Map() }
}

export function isDeskIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < DESK_COUNT
}

export function sameAssignments(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false
  for (const [id, desk] of a) if (b.get(id) !== desk) return false
  return true
}

/**
 * One reconciliation step. `candidates` is the full roster in seating order (oldest first), so the pick order
 * is deterministic even though each individual choice is random. Returns a new plan; `prev` is not mutated.
 */
export function reconcileDesks(
  prev: DeskPlan,
  candidates: readonly DeskCandidate[],
  now: number,
  pick: DeskPick = randomPick,
): DeskPlan {
  const present = new Set(candidates.map((c) => c.id))
  const assignments = new Map<string, number>()
  const taken = new Set<number>()

  // 1. Keep every valid existing assignment. Anything absent, out of range or double-booked is dropped.
  for (const [id, desk] of prev.assignments) {
    if (!present.has(id) || !isDeskIndex(desk) || taken.has(desk)) continue
    assignments.set(id, desk)
    taken.add(desk)
  }

  // 2. Idle holders keep their desk for the grace window, then release it.
  const idleSince = new Map<string, number>()
  for (const candidate of candidates) {
    const desk = assignments.get(candidate.id)
    if (desk === undefined || candidate.working) continue
    const since = prev.idleSince.get(candidate.id) ?? now
    if (now - since >= DESK_GRACE_MS) {
      assignments.delete(candidate.id)
      taken.delete(desk)
      continue
    }
    idleSince.set(candidate.id, since)
  }

  // 3. Working characters without a desk pick a random free one, in seating order. A full office leaves the
  //    rest without a desk (they wait on the standing spots) until a desk is released.
  for (const candidate of candidates) {
    if (!candidate.working || assignments.has(candidate.id)) continue
    const free: number[] = []
    for (let desk = 0; desk < DESK_COUNT; desk++) if (!taken.has(desk)) free.push(desk)
    if (free.length === 0) break
    const desk = pick(free)
    assignments.set(candidate.id, desk)
    taken.add(desk)
  }

  return { assignments, idleSince }
}

export function candidatesFor(snapshot: OfficeSnapshot): DeskCandidate[] {
  return snapshot.characters.map((c) => ({ id: c.id, working: c.status !== 'idle' }))
}

/** Copy of `snapshot` with each character's `desk` set from the occupancy (null when it has none). */
export function withDesks(snapshot: OfficeSnapshot, assignments: ReadonlyMap<string, number>): OfficeSnapshot {
  return {
    ...snapshot,
    characters: snapshot.characters.map((c) => ({ ...c, desk: assignments.get(c.id) ?? null })),
  }
}
