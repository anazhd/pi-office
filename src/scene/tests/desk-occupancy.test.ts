// The client shows the server's desk occupancy; it must never reshuffle it on refresh or double-book a desk.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { ActivityStatus, Character, OfficeSnapshot } from '../../../shared/office-types.ts'
import {
  candidatesFor,
  DESK_COUNT,
  DESK_GRACE_MS,
  emptyDeskPlan,
  reconcileDesks,
  withDesks,
  type DeskPick,
} from '../../../shared/desk-allocation.ts'
import { DESK_CAPACITY, DESK_SEATS } from '../layout.ts'
import { initialPlannerState, positionAt, step, type PlannerState } from '../scene-planner.ts'

function character(id: string, status: ActivityStatus, desk: number | null): Character {
  return {
    id,
    provider: id.split('/')[0],
    model: id.split('/')[1] ?? id,
    displayName: id,
    stats: {
      messages: 1,
      outputTokens: 1,
      inputTokens: 1,
      toolCalls: 0,
      sessions: 1,
      todayOutputTokens: 0,
      firstSeen: 0,
      lastSeen: 0,
    },
    level: 1,
    title: 'Intern',
    xp: 0,
    levelProgress: 0,
    status,
    desk,
    active: [],
  }
}

function snap(entries: Array<[string, ActivityStatus, number | null]>, now: number): OfficeSnapshot {
  return {
    now,
    characters: entries.map(([id, status, desk]) => character(id, status, desk)),
    totals: { activeSessions: 0, workingCharacters: 0, todayOutputTokens: 0, lifetimeOutputTokens: 0 },
  }
}

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

test('the client layout has exactly as many desks as the shared allocator', () => {
  assert.equal(DESK_CAPACITY, DESK_COUNT)
})

test('refresh: a fresh client seats the remaining workers at their server desks without walking', () => {
  // Before the departure: a, b, c work at desks 0, 1, 2. Then a leaves and the server releases its desk.
  const before = snap(
    [
      ['p/a', 'tool', 0],
      ['p/b', 'tool', 1],
      ['p/c', 'tool', 2],
    ],
    0,
  )
  const after = snap(
    [
      ['p/a', 'idle', null],
      ['p/b', 'tool', 1],
      ['p/c', 'thinking', 2],
    ],
    DESK_GRACE_MS,
  )
  // The browser refreshes: the client has no memory of the previous state.
  const refreshed: PlannerState = step(initialPlannerState(), after, DESK_GRACE_MS)
  assert.equal(refreshed.plans.get('p/b')!.deskIndex, 1)
  assert.equal(refreshed.plans.get('p/c')!.deskIndex, 2)
  for (const id of ['p/b', 'p/c']) {
    const plan = refreshed.plans.get(id)!
    assert.equal(plan.walkDuration, 0, `${id} does not walk on refresh`)
    assert.equal(positionAt(plan, DESK_GRACE_MS + 60_000).walking, false)
  }

  // Same as a client that never refreshed: identical seats.
  const live = step(step(initialPlannerState(), before, 0), after, DESK_GRACE_MS)
  for (const id of ['p/b', 'p/c']) {
    assert.equal(refreshed.plans.get(id)!.seat.id, live.plans.get(id)!.seat.id)
  }
})

test('a worker seated by the server lands on that desk, not the first free one', () => {
  const state = step(initialPlannerState(), snap([['p/new', 'tool', 9]], 0), 0)
  const plan = state.plans.get('p/new')!
  assert.equal(plan.deskIndex, 9)
  assert.equal(plan.seat.id, DESK_SEATS[9].id)
})

test('the client never double-books a desk: a duplicate claim is ignored for the later character', () => {
  const state = step(initialPlannerState(), snap([['p/a', 'tool', 3], ['p/b', 'tool', 3]], 0), 0)
  assert.equal(state.plans.get('p/a')!.deskIndex, 3)
  assert.equal(state.plans.get('p/b')!.deskIndex, null)
  assert.notEqual(state.plans.get('p/b')!.seat.id, DESK_SEATS[3].id)
  assert.equal(state.plans.get('p/b')!.seat.kind, 'standing')
})

test('out-of-range, fractional or missing desks never seat anyone at a desk', () => {
  const state = step(
    initialPlannerState(),
    snap(
      [
        ['p/a', 'tool', DESK_COUNT],
        ['p/b', 'tool', -1],
        ['p/c', 'tool', 1.5],
        ['p/d', 'tool', undefined as unknown as null],
      ],
      0,
    ),
    0,
  )
  for (const id of ['p/a', 'p/b', 'p/c', 'p/d']) {
    assert.equal(state.plans.get(id)!.deskIndex, null, `${id} has no desk`)
  }
})

test('composed with the server allocator: a departure and a refresh leave the remaining workers in place', () => {
  // Server side: the same reconcile + withDesks that OfficeStore runs. A seeded picker stands in for Math.random.
  const rng = seeded(7)
  const pick: DeskPick = (free) => free[Math.floor(rng() * free.length)]
  const roster = (working: Record<string, boolean>, now: number): OfficeSnapshot => ({
    now,
    characters: ['p/a', 'p/b', 'p/c'].map((id) => character(id, working[id] ? 'tool' : 'idle', null)),
    totals: { activeSessions: 0, workingCharacters: 0, todayOutputTokens: 0, lifetimeOutputTokens: 0 },
  })
  // Server state advances exactly once per snapshot, like OfficeStore.snapshot().
  let plan = emptyDeskPlan()
  const tick = (snapshot: OfficeSnapshot): OfficeSnapshot => {
    plan = reconcileDesks(plan, candidatesFor(snapshot), snapshot.now, pick)
    return withDesks(snapshot, plan.assignments)
  }

  const first = tick(roster({ 'p/a': true, 'p/b': true, 'p/c': true }, 0))
  const seatsBefore = Object.fromEntries(first.characters.map((c) => [c.id, c.desk]))
  assert.equal(new Set(Object.values(seatsBefore)).size, 3)

  // a departs; the server releases its desk after the grace window while b and c keep working.
  tick(roster({ 'p/a': false, 'p/b': true, 'p/c': true }, 1000))
  const served = tick(roster({ 'p/a': false, 'p/b': true, 'p/c': true }, 1000 + DESK_GRACE_MS))
  assert.equal(served.characters.find((c) => c.id === 'p/a')!.desk, null)

  // The browser refreshes: a brand-new client only receives the server's snapshot.
  const seated = Object.fromEntries(served.characters.map((c) => [c.id, c.desk]))
  assert.equal(seated['p/b'], seatsBefore['p/b'])
  assert.equal(seated['p/c'], seatsBefore['p/c'])
  const refreshed = step(initialPlannerState(), served, 1000 + DESK_GRACE_MS)
  assert.equal(refreshed.plans.get('p/b')!.seat.id, DESK_SEATS[seatsBefore['p/b']!].id)
  assert.equal(refreshed.plans.get('p/c')!.seat.id, DESK_SEATS[seatsBefore['p/c']!].id)
  assert.equal(refreshed.plans.get('p/b')!.walkDuration, 0)
  assert.equal(refreshed.plans.get('p/c')!.walkDuration, 0)
})
