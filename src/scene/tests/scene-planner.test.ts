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
  buildRoute,
  DESK_BENCHES,
  DESK_SEATS,
  DOOR,
  LANE_GRAPH,
  LANE_ROUTE_PAD,
  LOUNGE_SEATS,
  pathLength,
  portalForSeat,
  seatOwnFootprints,
  segmentCrossesObstacle,
  standingSeatFor,
  type Seat,
} from '../layout.ts'
import {
  FURNITURE_FOOTPRINTS,
  OBSTACLES,
  STATIC_FURNITURE,
  type Box,
} from '../footprints.ts'
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


function sameBox(a: Box, b: Box): boolean {
  return (
    Math.abs(a.gx - b.gx) < 1e-9 &&
    Math.abs(a.gy - b.gy) < 1e-9 &&
    Math.abs(a.w - b.w) < 1e-9 &&
    Math.abs(a.d - b.d) < 1e-9
  )
}

function inBox(point: { gx: number; gy: number }, box: Box): boolean {
  return (
    point.gx >= box.gx - 1e-6 &&
    point.gx <= box.gx + box.w + 1e-6 &&
    point.gy >= box.gy - 1e-6 &&
    point.gy <= box.gy + box.d + 1e-6
  )
}

/**
 * A route is valid when it starts/ends exactly where asked and every segment is either
 * the origin's stand-up leg, the destination's sit-down leg, or completely clear.
 */
function assertValidRoute(
  points: Array<{ gx: number; gy: number }>,
  from: { gx: number; gy: number },
  to: Seat,
  fromOwn: Box[] = [],
  toOwn: Box[] = seatOwnFootprints(to),
  firstIgnored: Box[] = [],
) {
  assert.ok(points.length >= 1, 'route has points')
  assert.ok(
    Math.hypot(points[0].gx - from.gx, points[0].gy - from.gy) < 1e-6,
    'route starts exactly at the current position',
  )
  const last = points[points.length - 1]
  assert.ok(
    Math.hypot(last.gx - to.gx, last.gy - to.gy) < 1e-6,
    `route ends exactly at ${to.id}`,
  )
  for (let i = 1; i < points.length; i++) {
    const allowed: Box[] = []
    if (i === 1) allowed.push(...fromOwn, ...firstIgnored)
    if (i === points.length - 1) allowed.push(...toOwn)
    for (const box of OBSTACLES) {
      if (!segmentCrossesObstacle(points[i - 1], points[i], box)) continue
      assert.ok(
        allowed.some((own) => sameBox(own, box)),
        `segment ${i} (${points[i - 1].gx},${points[i - 1].gy})->(${points[i].gx},${points[i].gy}) crosses ${box.gx},${box.gy},${box.w},${box.d} on route to ${to.id}: ${JSON.stringify(points)}`,
      )
    }
  }
}

const STANDING_SEATS = Array.from({ length: 6 }, (_, i) => standingSeatFor(i))

test('every seat and the door route to every other seat with valid, exact routes', () => {
  const seats: Seat[] = [...DESK_SEATS, ...LOUNGE_SEATS, ...STANDING_SEATS]
  const origins: Array<{ point: { gx: number; gy: number }; seat: Seat | null }> = [
    ...seats.map((seat) => ({ point: { gx: seat.gx, gy: seat.gy }, seat })),
    { point: DOOR, seat: null },
  ]

  for (const origin of origins) {
    for (const target of seats) {
      if (origin.seat?.id === target.id) continue
      const points = buildRoute(origin.point, target, origin.seat)
      assertValidRoute(
        points,
        origin.point,
        target,
        origin.seat ? seatOwnFootprints(origin.seat) : [],
      )
    }
  }
})

test('mid-walk retargets keep the exact current point and never cross furniture', () => {
  const loungeRoutes = [DESK_SEATS[0], DESK_SEATS[5], DESK_SEATS[10], DESK_SEATS[15]]
  const returnRoutes = [LOUNGE_SEATS[0], LOUNGE_SEATS[3], LOUNGE_SEATS[7], LOUNGE_SEATS[15]]
  const retargets: Seat[] = [...LOUNGE_SEATS, DESK_SEATS[0], DESK_SEATS[4], DESK_SEATS[8], DESK_SEATS[12]]
  const fractions = [0.05, 0.1, 0.25, 0.5, 0.75, 0.95]

  const routes: Array<{ from: { gx: number; gy: number }; fromKind: 'desk' | 'sofa' | 'cushion'; fromRow?: 1 | 2 | 3; seat: Seat }> = []
  for (const desk of loungeRoutes) {
    for (const lounge of LOUNGE_SEATS) {
      routes.push({
        from: { gx: desk.gx, gy: desk.gy },
        fromKind: 'desk',
        fromRow: desk.row,
        seat: lounge,
      })
    }
  }
  for (const lounge of returnRoutes) {
    for (const desk of DESK_SEATS) {
      routes.push({
        from: { gx: lounge.gx, gy: lounge.gy },
        fromKind: lounge.kind as 'sofa' | 'cushion',
        seat: desk,
      })
    }
  }
  for (const target of [...LOUNGE_SEATS, DESK_SEATS[0], DESK_SEATS[4], DESK_SEATS[8], DESK_SEATS[12]]) {
    routes.push({ from: DOOR, fromKind: 'desk', seat: target })
  }

  let checked = 0
  for (const route of routes) {
    const path = buildPath(route.from, { gx: route.seat.gx, gy: route.seat.gy }, {
      fromKind: route.fromKind,
      fromRow: route.fromRow,
      toKind: route.seat.kind,
      toRow: route.seat.row,
    })
    for (const fraction of fractions) {
      const plan: Plan = {
        char: character(`walker/${checked}`, 'idle'),
        seat: route.seat,
        deskIndex: null,
        path,
        walkStart: 0,
        walkDuration: 6000,
        enteredAt: 0,
        isNew: false,
      }
      const at = fraction * plan.walkDuration
      const current = positionAt(plan, at)
      assert.equal(current.walking, true)
      const currentPoint = { gx: current.gx, gy: current.gy }
      const ignored = OBSTACLES.filter((box) => inBox(currentPoint, box))
      for (const target of retargets) {
        const next = buildRoute(currentPoint, target, null)
        assertValidRoute(
          next,
          currentPoint,
          target,
          [],
          seatOwnFootprints(target),
          ignored,
        )
        checked += 1
      }
    }
  }
  assert.ok(checked > 1000, `checked ${checked} retargets`)
})

test('inserting a new hire at index 0 does not shift sticky lounge seats or teleport walkers', () => {
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
  assert.equal(state.plans.get('a/tool')!.seat.id, DESK_SEATS[0].id)
  assert.equal(state.plans.get('b/tool')!.seat.id, DESK_SEATS[1].id)

  const idleAt = 1000
  state = step(
    state,
    snapshot(
      [
        ['a/tool', 'idle'],
        ['b/tool', 'idle'],
      ],
      idleAt,
    ),
    idleAt,
  )
  const expiry = idleAt + DESK_GRACE_MS
  state = step(
    state,
    snapshot(
      [
        ['a/tool', 'idle'],
        ['b/tool', 'idle'],
      ],
      idleAt,
    ),
    expiry,
  )
  const aSeat = state.plans.get('a/tool')!.seat.id
  const bSeat = state.plans.get('b/tool')!.seat.id
  assert.equal(aSeat, LOUNGE_SEATS[0].id)
  assert.equal(bSeat, LOUNGE_SEATS[1].id)

  const now = expiry + 1200
  const beforeA = state.plans.get('a/tool')!
  const beforeB = state.plans.get('b/tool')!
  assert.equal(positionAt(beforeA, now).walking, true)
  assert.equal(positionAt(beforeB, now).walking, true)
  const posA = positionAt(beforeA, now)
  const posB = positionAt(beforeB, now)

  state = step(
    state,
    snapshot(
      [
        ['new/model', 'idle'],
        ['a/tool', 'idle'],
        ['b/tool', 'idle'],
      ],
      now,
    ),
    now,
  )

  const afterA = state.plans.get('a/tool')!
  const afterB = state.plans.get('b/tool')!
  assert.equal(afterA.seat.id, aSeat, 'a keeps its lounge seat')
  assert.equal(afterB.seat.id, bSeat, 'b keeps its lounge seat')
  assert.equal(afterA.path, beforeA.path, 'a keeps walking the same path')
  assert.equal(afterB.path, beforeB.path, 'b keeps walking the same path')
  const nowA = positionAt(afterA, now)
  const nowB = positionAt(afterB, now)
  assert.ok(Math.hypot(nowA.gx - posA.gx, nowA.gy - posA.gy) < 1e-6, 'a does not teleport')
  assert.ok(Math.hypot(nowB.gx - posB.gx, nowB.gy - posB.gy) < 1e-6, 'b does not teleport')
  assert.equal(state.plans.get('new/model')!.seat.id, LOUNGE_SEATS[2].id)
})

test('lane graph edges are clear and use the shared furniture footprints', () => {
  assert.ok(LANE_GRAPH.nodes.length > 100)
  assert.ok(LANE_GRAPH.edges.length > 100)
  for (const edge of LANE_GRAPH.edges) {
    for (const box of OBSTACLES) {
      assert.equal(
        segmentCrossesObstacle(edge.a, edge.b, box, 0),
        false,
        `lane edge crosses ${box.gx},${box.gy},${box.w},${box.d}`,
      )
      assert.equal(
        segmentCrossesObstacle(edge.a, edge.b, box, LANE_ROUTE_PAD),
        false,
        'lane edge violates the routing clearance',
      )
    }
  }

  for (const box of [...STATIC_FURNITURE, FURNITURE_FOOTPRINTS.sofa, FURNITURE_FOOTPRINTS.coffeeTable]) {
    assert.ok(
      OBSTACLES.some((obstacle) => obstacle === box),
      'routing uses the exact same Box objects furniture.tsx renders',
    )
  }
  for (const box of FURNITURE_FOOTPRINTS.beanbags) {
    assert.ok(OBSTACLES.includes(box))
  }
  for (const box of FURNITURE_FOOTPRINTS.plants) {
    assert.ok(OBSTACLES.includes(box))
  }
  for (const seat of [...DESK_SEATS, ...LOUNGE_SEATS]) {
    const portal = portalForSeat(seat)
    assert.ok(
      !OBSTACLES.some((box) => inBox(portal, box)),
      `portal for ${seat.id} is in a clear lane`,
    )
  }
})
