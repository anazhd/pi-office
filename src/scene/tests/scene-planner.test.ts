import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ActivityStatus,
  Character,
  OfficeSnapshot,
} from '../../../shared/office-types.ts'
import {
  buildPath,
  buildRetargetPath,
  DESK_BENCHES,
  DESK_SEATS,
  DOOR,
  LOUNGE_SEATS,
  pathLength,
  segmentCrossesObstacle,
  type Seat,
} from '../layout.ts'
import {
  DESK_GRACE_MS,
  initialPlannerState,
  positionAt,
  step,
  type Plan,
} from '../scene-planner.ts'

function character(id: string, status: ActivityStatus = 'idle'): Character {
  return {
    id,
    provider: id.split('/')[0] ?? 'test',
    model: id.split('/')[1] ?? id,
    displayName: id,
    stats: {
      messages: 1,
      outputTokens: 1000,
      inputTokens: 1000,
      toolCalls: 1,
      sessions: 1,
      todayOutputTokens: 10,
      firstSeen: 0,
      lastSeen: 0,
    },
    level: 1,
    title: 'Intern',
    xp: 1000,
    levelProgress: 0,
    status,
    active: [],
  }
}

function snapshot(entries: Array<[string, ActivityStatus]>, now: number): OfficeSnapshot {
  const characters = entries.map(([id, status]) => character(id, status))
  return {
    now,
    characters,
    totals: {
      activeSessions: 0,
      workingCharacters: characters.filter((c) => c.status !== 'idle').length,
      todayOutputTokens: 0,
      lifetimeOutputTokens: 0,
    },
  }
}

function assertNoBenchCrossing(points: Array<{ gx: number; gy: number }>) {
  for (let i = 1; i < points.length; i++) {
    for (const bench of DESK_BENCHES) {
      assert.equal(
        segmentCrossesObstacle(points[i - 1], points[i], bench),
        false,
        `segment ${i} crosses bench at ${bench.gx},${bench.gy}`,
      )
    }
  }
}

test('StrictMode-style double step is pure and idempotent', () => {
  const prev = initialPlannerState()
  const frozen = structuredClone(prev)
  const input = snapshot(
    [
      ['a', 'tool'],
      ['b', 'thinking'],
      ['c', 'idle'],
    ],
    0,
  )

  const first = step(prev, input, 1000)
  assert.deepEqual(prev, frozen, 'step must not mutate the previous state')

  const second = step(first, input, 1000)
  assert.deepEqual(second, first)
  assert.equal(second, first, 'unchanged tick should return the same reference')

  const replay = step(prev, input, 1000)
  assert.deepEqual(replay, first, 'replaying from the same committed state is equivalent')
  assert.deepEqual(prev, frozen)
})

test('desk assignments stay unique across many random snapshots', () => {
  const roster = Array.from({ length: 20 }, (_, i) => `p/m${i}`)
  let seed = 0x1234abcd
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0xffffffff
  }

  let state = initialPlannerState()
  for (let i = 0; i < 120; i++) {
    const size = 1 + Math.floor(random() * roster.length)
    const entries: Array<[string, ActivityStatus]> = roster
      .slice(0, size)
      .map((id) => [id, random() < 0.55 ? 'tool' : 'idle'])
    const now = i * 5000
    state = step(state, snapshot(entries, now), now)

    const deskValues = [...state.desks.values()]
    assert.equal(new Set(deskValues).size, deskValues.length, 'a desk is never double-booked')
    assert.equal(state.plans.size, entries.length, 'plans match the present roster')
    for (const [id] of entries) {
      if (state.desks.has(id)) assert.ok(state.desks.get(id)! < DESK_SEATS.length)
    }
  }
})

test('grace keeps a desk for 20s, then the worker walks back to the lounge', () => {
  const working = character('a/tool', 'tool')
  const idle = character('a/tool', 'idle')
  let state = step(initialPlannerState(), snapshot([['a/tool', 'tool']], 0), 0)
  assert.equal(state.desks.get('a/tool'), 0)

  const idleAt = 1000
  const idleSnapshot = snapshot([['a/tool', 'idle']], idleAt)
  state = step(state, idleSnapshot, idleAt)
  assert.equal(state.desks.get('a/tool'), 0)
  assert.equal(state.plans.get('a/tool')!.seat.id, DESK_SEATS[0].id)
  assert.equal(working.status, 'tool')
  assert.equal(idle.status, 'idle')

  const expiry = idleAt + DESK_GRACE_MS
  const justBefore = step(state, idleSnapshot, expiry - 1)
  assert.equal(justBefore, state, 'no churn before the grace window expires')
  assert.equal(justBefore.desks.get('a/tool'), 0)

  const atExpiry = step(state, idleSnapshot, expiry)
  assert.notEqual(atExpiry, state)
  assert.equal(atExpiry.desks.has('a/tool'), false)
  const plan = atExpiry.plans.get('a/tool')!
  assert.equal(plan.seat.kind, 'sofa')
  assert.equal(plan.walkStart, expiry)
  assert.ok(plan.walkDuration > 0)
  assert.ok(pathLength(plan.path) > 1)
})

test('reactivation inside the grace window resumes typing at the same desk', () => {
  let state = step(initialPlannerState(), snapshot([['a/tool', 'tool']], 0), 0)
  state = step(state, snapshot([['a/tool', 'idle']], 1000), 1000)
  const desk = state.desks.get('a/tool')

  const reactivatedAt = 5000
  state = step(state, snapshot([['a/tool', 'thinking']], reactivatedAt), reactivatedAt)
  const plan = state.plans.get('a/tool')!
  assert.equal(state.desks.get('a/tool'), desk)
  assert.equal(plan.deskIndex, desk)
  assert.equal(plan.seat.id, DESK_SEATS[desk!].id)
  assert.equal(plan.walkDuration, 0)
  assert.equal(positionAt(plan, reactivatedAt).walking, false)
})

test('mid-walk retargeting starts at the current point and never crosses a bench', () => {
  for (let index = 0; index < DESK_SEATS.length; index++) {
    const from = DESK_SEATS[index]
    const target = DESK_SEATS.find((seat) => seat.row !== from.row) ?? DESK_SEATS[0]
    const lounge = LOUNGE_SEATS[0]
    const path = buildPath(
      { gx: from.gx, gy: from.gy },
      { gx: lounge.gx, gy: lounge.gy },
      {
        fromKind: 'desk',
        fromRow: from.row,
        toKind: lounge.kind,
        toRow: lounge.row,
      },
    )
    const plan: Plan = {
      char: character(`returning/${index}`, 'idle'),
      seat: lounge,
      deskIndex: null,
      path,
      walkStart: 0,
      walkDuration: 6000,
      enteredAt: 0,
      isNew: false,
    }

    for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const now = fraction * plan.walkDuration
      const current = positionAt(plan, now)
      assert.equal(current.walking, true)
      // Directly exercise the retarget helper used by step().
      const route = buildRetargetPath(
        path,
        { gx: current.gx, gy: current.gy },
        current.distance,
        { gx: target.gx, gy: target.gy },
        { toKind: 'desk', toRow: target.row },
      )
      assert.ok(route.length >= 2)
      assert.ok(Math.hypot(route[0].gx - current.gx, route[0].gy - current.gy) < 0.02)
      assertNoBenchCrossing(route)
    }
  }
})

test('step retargets a mid-walk return from the current point without crossing a bench', () => {
  let state = step(initialPlannerState(), snapshot([['a/tool', 'tool']], 0), 0)
  const idleSnapshot = snapshot([['a/tool', 'idle']], 1000)
  state = step(state, idleSnapshot, 1000)
  const expiry = 1000 + DESK_GRACE_MS
  state = step(state, idleSnapshot, expiry)
  const returnPlan = state.plans.get('a/tool')!
  assert.ok(returnPlan.walkDuration > 0)
  assert.equal(returnPlan.seat.kind, 'sofa')

  const reactivatedAt = expiry + returnPlan.walkDuration * 0.45
  const before = positionAt(returnPlan, reactivatedAt)
  assert.equal(before.walking, true)

  state = step(state, snapshot([['a/tool', 'tool']], reactivatedAt), reactivatedAt)
  const plan = state.plans.get('a/tool')!
  assert.equal(plan.seat.kind, 'desk')
  assert.ok(plan.walkDuration > 0)
  const after = positionAt(plan, reactivatedAt)
  assert.ok(Math.hypot(after.gx - before.gx, after.gy - before.gy) < 0.02)
  assertNoBenchCrossing(plan.path)
})

test('a new hire keeps isNew/confetti for the whole entrance', () => {
  const base: Array<[string, ActivityStatus]> = [['old/model', 'idle']]
  let state = step(initialPlannerState(), snapshot(base, 0), 0)
  const enteredAt = 1000
  const arrival: Array<[string, ActivityStatus]> = [
    ['old/model', 'idle'],
    ['new/model', 'tool'],
  ]
  state = step(state, snapshot(arrival, enteredAt), enteredAt)
  const firstPlan = state.plans.get('new/model')!
  assert.equal(firstPlan.isNew, true)
  assert.equal(firstPlan.enteredAt, enteredAt)
  assert.ok(firstPlan.walkDuration > 0)
  assert.equal(firstPlan.path[0].gx, DOOR.gx)
  assert.equal(firstPlan.path[0].gy, DOOR.gy)

  const confettiUntil = enteredAt + firstPlan.walkDuration + 2400
  for (let elapsed = 500; elapsed <= firstPlan.walkDuration + 3000; elapsed += 500) {
    const now = enteredAt + elapsed
    state = step(state, snapshot(arrival, now), now)
    const plan = state.plans.get('new/model')!
    assert.equal(plan.isNew, true, 'isNew must not be recomputed from the seen set')
    assert.equal(plan.enteredAt, enteredAt)
    const confetti = plan.isNew && now < plan.enteredAt + plan.walkDuration + 2400
    assert.equal(confetti, now < confettiUntil)
  }
  assert.equal(enteredAt + (firstPlan.walkDuration + 3000) < confettiUntil, false)
})

test('first render places everyone seated without walking', () => {
  const state = step(
    initialPlannerState(),
    snapshot(
      [
        ['a/tool', 'tool'],
        ['b/idle', 'idle'],
        ['c/thinking', 'thinking'],
      ],
      0,
    ),
    0,
  )
  for (const plan of state.plans.values()) {
    assert.equal(plan.walkDuration, 0)
    assert.equal(plan.path.length, 0)
    assert.equal(plan.isNew, false)
    const at = positionAt(plan, 0)
    assert.equal(at.walking, false)
    assert.equal(at.gx, plan.seat.gx)
    assert.equal(at.gy, plan.seat.gy)
  }
  assert.equal(state.plans.get('a/tool')!.seat.kind, 'desk')
  assert.equal(state.plans.get('b/idle')!.seat.kind, 'sofa')
})

test('a removed character frees its desk for the next worker', () => {
  let state = step(
    initialPlannerState(),
    snapshot(
      [
        ['a/tool', 'tool'],
        ['b/tool', 'tool'],
      ],
      0,
    ),
    0,
  )
  assert.equal(state.desks.get('a/tool'), 0)
  assert.equal(state.desks.get('b/tool'), 1)

  state = step(
    state,
    snapshot(
      [
        ['b/tool', 'tool'],
        ['c/tool', 'tool'],
      ],
      1000,
    ),
    1000,
  )
  assert.equal(state.plans.has('a/tool'), false)
  assert.equal(state.desks.has('a/tool'), false)
  assert.equal(state.desks.get('c/tool'), 0)
  const deskValues = [...state.desks.values()]
  assert.equal(new Set(deskValues).size, deskValues.length)
})

test('hot desks are handed out first-free by roster order and stay stable', () => {
  let state = step(
    initialPlannerState(),
    snapshot(
      [
        ['a/tool', 'tool'],
        ['b/idle', 'idle'],
        ['c/tool', 'tool'],
      ],
      0,
    ),
    0,
  )
  assert.equal(state.desks.get('a/tool'), 0)
  assert.equal(state.desks.get('c/tool'), 1)
  assert.equal(state.desks.has('b/idle'), false)

  const first = state.desks.get('a/tool')
  state = step(
    state,
    snapshot(
      [
        ['a/tool', 'thinking'],
        ['b/idle', 'idle'],
        ['c/tool', 'tool'],
      ],
      1000,
    ),
    1000,
  )
  assert.equal(state.desks.get('a/tool'), first)
})
