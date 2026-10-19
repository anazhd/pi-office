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
  LOUNGE_CROWD_SPOTS,
  LOUNGE_OVERFLOW_SPOTS,
  LOUNGE_SEATS,
  SEPARATED_LOUNGE_OVERFLOW_BASE,
  SEPARATED_STANDING_OVERFLOW_BASE,
  pathLength,
  portalForSeat,
  seatOwnFootprints,
  segmentCrossesObstacle,
  SPOT_MARGIN,
  standingSeatFor,
  SEPARATED_LOUNGE_CAPACITY,
  SEPARATED_STANDING_CAPACITY,
  STANDING_CROWD_SPOTS,
  STANDING_OVERFLOW_SPOTS,
  loungeSeatFor,
  type Seat,
} from '../layout.ts'
import {
  DESK_CHAIR_BOXES,
  DESK_MONITOR_BOXES,
  FURNITURE_FOOTPRINTS,
  PLANT_SPECS,
  STATIC_FURNITURE,
  type Box,
} from '../footprints.ts'
import { OBSTACLES } from '../routing-obstacles.ts'
import {
  DESK_GRACE_MS,
  headingAlongPath,
  initialPlannerState,
  MIN_HEADING_SEGMENT,
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
        segmentCrossesObstacle(points[i - 1], points[i], bench, LANE_ROUTE_PAD),
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
    )!
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
      )!
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

function inBox(point: { gx: number; gy: number }, box: Box, margin = 0): boolean {
  return (
    point.gx >= box.gx - margin - 1e-6 &&
    point.gx <= box.gx + box.w + margin + 1e-6 &&
    point.gy >= box.gy - margin - 1e-6 &&
    point.gy <= box.gy + box.d + margin + 1e-6
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
    // The origin stand-up leg and destination sit-down leg are exempt from the lane
    // clearance (they must enter the seat's own furniture); every other segment must
    // keep LANE_ROUTE_PAD. A mid-walk connector has no stand-up exemption.
    const pad = LANE_ROUTE_PAD
    for (const box of OBSTACLES) {
      if (!segmentCrossesObstacle(points[i - 1], points[i], box, pad)) continue
      assert.ok(
        allowed.some((own) => sameBox(own, box)),
        `segment ${i} (${points[i - 1].gx},${points[i - 1].gy})->(${points[i].gx},${points[i].gy}) crosses ${box.gx},${box.gy},${box.w},${box.d} at pad ${pad} on route to ${to.id}: ${JSON.stringify(points)}`,
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
      const points = buildRoute(origin.point, target, origin.seat)!
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
  const loungeRoutes = [DESK_SEATS[0], DESK_SEATS[5], DESK_SEATS[8], DESK_SEATS[9]]
  const returnRoutes = [LOUNGE_SEATS[0], LOUNGE_SEATS[3], LOUNGE_SEATS[7], LOUNGE_SEATS[15]]
  const retargets: Seat[] = [...LOUNGE_SEATS, DESK_SEATS[0], DESK_SEATS[4], DESK_SEATS[8], DESK_SEATS[9]]
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
  for (const target of [...LOUNGE_SEATS, DESK_SEATS[0], DESK_SEATS[4], DESK_SEATS[8], DESK_SEATS[9]]) {
    routes.push({ from: DOOR, fromKind: 'desk', seat: target })
  }

  let checked = 0
  for (const route of routes) {
    const path = buildPath(route.from, { gx: route.seat.gx, gy: route.seat.gy }, {
      fromKind: route.fromKind,
      fromRow: route.fromRow,
      toKind: route.seat.kind,
      toRow: route.seat.row,
    })!
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
      const ignored = OBSTACLES.filter((box) => inBox(currentPoint, box, LANE_ROUTE_PAD))
      for (const target of retargets) {
        const next = buildRetargetPath(path, currentPoint, current.distance, target, {toKind:target.kind,toRow:target.row})!
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
      OBSTACLES.some(obstacle => obstacle.gx >= box.gx-1e-9 && obstacle.gy >= box.gy-1e-9 && obstacle.gx+obstacle.w <= box.gx+box.w+1e-9 && obstacle.gy+obstacle.d <= box.gy+box.d+1e-9),
      'routing covers the shared render footprint, including split pieces',
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


test('buildRoute returns blocked for an unreachable target instead of crossing furniture', () => {
  const insideTable: Seat = { id: 'unreachable-table', gx: 11.0, gy: 6.1, kind: 'cushion', facing: 'right' }
  const outsideRoom: Seat = { id: 'unreachable-outside', gx: 20, gy: 20, kind: 'standing', facing: 'up' }

  assert.equal(buildRoute(DOOR, insideTable, null), null)
  assert.equal(buildRoute(DOOR, outsideRoom, null), null)
})

test('planner holds a character in place instead of adopting an unreachable seat', () => {
  const target = LOUNGE_SEATS[0]
  const original = { gx: target.gx, gy: target.gy }
  try {
    const working = step(
      initialPlannerState(),
      snapshot(
        [
          ['a', 'tool'],
          ['b', 'idle'],
        ],
        0,
      ),
      0,
    )
    const deskPlan = working.plans.get('a')!
    assert.equal(deskPlan.seat.kind, 'desk')
    const deskPosition = { gx: deskPlan.seat.gx, gy: deskPlan.seat.gy }

    // Make the lounge seat genuinely unreachable: its coordinates move inside the
    // coffee table, so the final sit-down leg would have to cross furniture.
    target.gx = 11.0
    target.gy = 6.1

    const idle = snapshot(
      [
        ['a', 'idle'],
        ['b', 'idle'],
      ],
      1,
    )
    const graceStarted = step(working, idle, 1)
    const afterGrace = step(graceStarted, idle, DESK_GRACE_MS + 2)
    const held = afterGrace.plans.get('a')!

    assert.notEqual(held.seat.id, target.id, 'must not adopt the unreachable lounge seat')
    assert.equal(held.seat.id, deskPlan.seat.id, 'stays at the old seat')
    const at = positionAt(held, DESK_GRACE_MS + 3)
    assert.equal(at.walking, false)
    assert.ok(Math.hypot(at.gx - deskPosition.gx, at.gy - deskPosition.gy) < 1e-9)
    assert.ok(Math.hypot(at.gx - target.gx, at.gy - target.gy) > 1, 'no teleport to the target')

    // A later snapshot retries the move, still without moving or teleporting.
    const idleRetry = snapshot(
      [
        ['a', 'idle'],
        ['b', 'idle'],
      ],
      2,
    )
    const retried = step(afterGrace, idleRetry, DESK_GRACE_MS + 4)
    const stillHeld = retried.plans.get('a')!
    assert.equal(stillHeld.seat.id, deskPlan.seat.id)
    const retriedAt = positionAt(stillHeld, DESK_GRACE_MS + 5)
    assert.ok(Math.hypot(retriedAt.gx - deskPosition.gx, retriedAt.gy - deskPosition.gy) < 1e-9)
  } finally {
    target.gx = original.gx
    target.gy = original.gy
  }
})


test('a blocked desk departure keeps the desk reserved instead of reassigning it', () => {
  const target = LOUNGE_SEATS[0]
  const original = { gx: target.gx, gy: target.gy }
  try {
    let state = step(initialPlannerState(), snapshot([['a/tool', 'tool']], 0), 0)
    const desk = state.desks.get('a/tool')!
    assert.equal(desk, 0)

    // Block the lounge departure: the destination seat sits inside the coffee table.
    target.gx = 11.0
    target.gy = 6.1
    const idle = snapshot([['a/tool', 'idle']], 1000)
    state = step(state, idle, 1000)
    state = step(state, idle, 1000 + DESK_GRACE_MS)

    assert.equal(state.desks.get('a/tool'), desk, 'the desk stays reserved on a failed departure')
    const held = state.plans.get('a/tool')!
    assert.equal(held.seat.id, DESK_SEATS[desk].id)
    assert.equal(held.deskIndex, desk)

    // A new working worker must not be handed the still-occupied desk.
    const withNewWorker = snapshot(
      [
        ['a/tool', 'idle'],
        ['b/tool', 'tool'],
      ],
      1000 + DESK_GRACE_MS,
    )
    state = step(state, withNewWorker, 1000 + DESK_GRACE_MS)
    assert.equal(state.desks.get('a/tool'), desk)
    assert.notEqual(state.desks.get('b/tool'), desk)
    assert.equal(state.plans.get('a/tool')!.deskIndex, desk)
  } finally {
    target.gx = original.gx
    target.gy = original.gy
  }
})

function assertSpotIsSafe(seat: Seat, margin = SPOT_MARGIN) {
  assert.ok(seat.gx > 0 && seat.gx < 14, `${seat.id} is inside the room horizontally`)
  assert.ok(seat.gy > 0 && seat.gy < 10, `${seat.id} is inside the room vertically`)
  for (const box of OBSTACLES) {
    assert.equal(
      inBox({ gx: seat.gx, gy: seat.gy }, { ...box, gx: box.gx - margin, gy: box.gy - margin, w: box.w + margin * 2, d: box.d + margin * 2 }),
      false,
      `${seat.id} overlaps furniture at ${box.gx},${box.gy},${box.w},${box.d} with margin ${margin}`,
    )
  }
}

function overflowLoungeSpots(): Seat[] {
  const spots: Seat[] = []
  for (let i = 0; i < SEPARATED_LOUNGE_OVERFLOW_BASE; i++) {
    spots.push(loungeSeatFor(LOUNGE_SEATS.length + i))
  }
  for (let i = 0; i < 5; i++) {
    spots.push(loungeSeatFor(LOUNGE_SEATS.length + SEPARATED_LOUNGE_OVERFLOW_BASE + i))
  }
  return spots
}

function overflowStandingSpots(): Seat[] {
  const spots: Seat[] = []
  for (let i = 0; i < SEPARATED_STANDING_OVERFLOW_BASE; i++) spots.push(standingSeatFor(i))
  for (let i = 0; i < 5; i++) {
    spots.push(standingSeatFor(SEPARATED_STANDING_OVERFLOW_BASE + i))
  }
  return spots
}

test('overflow lounge and standing spots are clear, bounded, reachable and routable', () => {
  assert.ok(SEPARATED_LOUNGE_OVERFLOW_BASE > 0)
  assert.ok(
    SEPARATED_STANDING_OVERFLOW_BASE >= 9,
    'the 40-character / 25-working roster has nine standers',
  )
  assert.equal(
    SEPARATED_LOUNGE_CAPACITY,
    LOUNGE_SEATS.length +
      SEPARATED_LOUNGE_OVERFLOW_BASE +
      LOUNGE_CROWD_SPOTS.length,
  )
  assert.equal(
    SEPARATED_STANDING_CAPACITY,
    SEPARATED_STANDING_OVERFLOW_BASE + STANDING_CROWD_SPOTS.length,
  )
  assert.ok(LOUNGE_CROWD_SPOTS.length > 0)
  assert.ok(STANDING_CROWD_SPOTS.length > 0)

  const targets: Seat[] = [...DESK_SEATS, ...LOUNGE_SEATS]
  for (const spot of [...overflowLoungeSpots(), ...overflowStandingSpots()]) {
    assertSpotIsSafe(spot)
    assert.ok(portalForSeat(spot), `${spot.id} has a portal`)
    const approach = buildRoute(DOOR, spot, null)
    assert.ok(approach, `${spot.id} is reachable from the door`)
    assertValidRoute(approach!, DOOR, spot)

    for (const target of targets) {
      const fromSpot = buildRoute(spot, target, spot)
      assert.ok(fromSpot, `${spot.id} can route to ${target.id}`)
      assertValidRoute(fromSpot!, spot, target)
    }

    const toLounge = buildRoute(spot, LOUNGE_SEATS[0], spot)
    assert.ok(toLounge)
  }
})


test('all separated overflow spots are at least 0.3 tile apart, with no stacked variants', () => {
  const groups: Array<{ name: string; spots: Seat[] }> = [
    { name: 'lounge fixed', spots: LOUNGE_SEATS },
    { name: 'lounge overflow', spots: LOUNGE_OVERFLOW_SPOTS },
    { name: 'lounge crowd', spots: LOUNGE_CROWD_SPOTS },
    { name: 'standing overflow', spots: STANDING_OVERFLOW_SPOTS },
    { name: 'standing crowd', spots: STANDING_CROWD_SPOTS },
  ]
  const all = groups.flatMap((group) => group.spots)
  assert.ok(LOUNGE_CROWD_SPOTS.length > 0)
  assert.ok(STANDING_CROWD_SPOTS.length > 0)

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const distance = Math.hypot(all[i].gx - all[j].gx, all[i].gy - all[j].gy)
      assert.ok(
        distance >= 0.3 - 1e-9,
        `${all[i].id} and ${all[j].id} are only ${distance.toFixed(3)} tiles apart`,
      )
    }
  }

  // Exercise the whole crowd range, including cycling beyond the separated capacity.
  const loungeCrowdStart = LOUNGE_SEATS.length + SEPARATED_LOUNGE_OVERFLOW_BASE
  for (let i = 0; i < LOUNGE_CROWD_SPOTS.length * 2; i++) {
    const seat = loungeSeatFor(loungeCrowdStart + i)
    assert.ok(
      LOUNGE_CROWD_SPOTS.some(
        (spot) => Math.abs(spot.gx - seat.gx) < 1e-9 && Math.abs(spot.gy - seat.gy) < 1e-9,
      ),
      `lounge crowd index ${i} lands on a separated crowd spot`,
    )
  }
  for (let i = 0; i < STANDING_CROWD_SPOTS.length * 2; i++) {
    const seat = standingSeatFor(SEPARATED_STANDING_OVERFLOW_BASE + i)
    assert.ok(
      STANDING_CROWD_SPOTS.some(
        (spot) => Math.abs(spot.gx - seat.gx) < 1e-9 && Math.abs(spot.gy - seat.gy) < 1e-9,
      ),
      `standing crowd index ${i} lands on a separated crowd spot`,
    )
  }
})

test('mid-walk retargets to and from overflow spots are valid and do not teleport', () => {
  const desk = DESK_SEATS[7]
  const lounge = LOUNGE_SEATS[0]
  const seed = buildPath(
    { gx: desk.gx, gy: desk.gy },
    { gx: lounge.gx, gy: lounge.gy },
    { fromKind: 'desk', fromRow: desk.row, toKind: lounge.kind, toRow: lounge.row },
  )!
  const plan: Plan = {
    char: character('walker/overflow', 'idle'),
    seat: lounge,
    deskIndex: null,
    path: seed,
    walkStart: 0,
    walkDuration: 6000,
    enteredAt: 0,
    isNew: false,
  }

  const targets = [...overflowLoungeSpots().slice(0, 8), ...overflowStandingSpots().slice(0, 8)]
  for (const fraction of [0.15, 0.45, 0.8]) {
    const current = positionAt(plan, fraction * plan.walkDuration)
    const point = { gx: current.gx, gy: current.gy }
    for (const target of targets) {
      const route = buildRetargetPath(plan.path, point, current.distance, target, {
        toKind: target.kind,
        toRow: target.row,
      })
      assert.ok(route)
      assertValidRoute(route!, point, target)
    }
  }

  for (const spot of targets) {
    const route = buildRoute(spot, desk, spot)
    assert.ok(route)
    const fromSpot: Plan = {
      char: character('walker/back', 'idle'),
      seat: desk,
      deskIndex: null,
      path: route!,
      walkStart: 0,
      walkDuration: 6000,
      enteredAt: 0,
      isNew: false,
    }
    const current = positionAt(fromSpot, 2400)
    assert.equal(current.walking, true)
    const retarget = buildRetargetPath(
      fromSpot.path,
      { gx: current.gx, gy: current.gy },
      current.distance,
      lounge,
      { toKind: lounge.kind, toRow: lounge.row },
    )
    assert.ok(retarget)
    assertValidRoute(retarget!, { gx: current.gx, gy: current.gy }, lounge)
  }
})


test('padded smoothing clears the floor lamp and desk-bench margins', () => {
  // Repro 1: lounge l1 -> desk d5 (index 4) used to shortcut inside the floor lamp pad.
  const lampFrom = LOUNGE_SEATS[0]
  const lampTo = DESK_SEATS[4]
  const lampRoute = buildRoute(
    { gx: lampFrom.gx, gy: lampFrom.gy },
    lampTo,
    lampFrom,
  )!
  assertValidRoute(
    lampRoute,
    { gx: lampFrom.gx, gy: lampFrom.gy },
    lampTo,
    seatOwnFootprints(lampFrom),
  )
  for (let i = 1; i < lampRoute.length; i++) {
    assert.equal(
      segmentCrossesObstacle(lampRoute[i - 1], lampRoute[i], FURNITURE_FOOTPRINTS.floorLamp, LANE_ROUTE_PAD),
      false,
      `lamp repro crosses the floor lamp pad on segment ${i}`,
    )
  }

  // Repro 2: desk d1 -> d7 used to shortcut inside the bench safety margin.
  const benchFrom = DESK_SEATS[0]
  const benchTo = DESK_SEATS[6]
  const benchRoute = buildRoute(
    { gx: benchFrom.gx, gy: benchFrom.gy },
    benchTo,
    benchFrom,
  )!
  assertValidRoute(
    benchRoute,
    { gx: benchFrom.gx, gy: benchFrom.gy },
    benchTo,
    seatOwnFootprints(benchFrom),
  )
  assertNoBenchCrossing(benchRoute)
})

test('fixed-seat routes stay bounded and heading hysteresis handles narrow clearances', () => {
  const seats = [...DESK_SEATS, ...LOUNGE_SEATS]
  const origins: Array<{ point: { gx: number; gy: number }; seat: Seat | null; id: string }> = [
    ...seats.map((seat) => ({ point: { gx: seat.gx, gy: seat.gy }, seat, id: seat.id })),
    { point: DOOR, seat: null, id: 'door' },
  ]

  for (const origin of origins) {
    for (const target of seats) {
      if (origin.seat?.id === target.id) continue
      const points = buildRoute(origin.point, target, origin.seat)
      assert.ok(points, `${origin.id} -> ${target.id} is routable`)
      assert.ok(points!.length <= 10, `${origin.id} -> ${target.id} has ${points!.length} points`)

      const portal = portalForSeat(target)
      const portalIndex = points!.findIndex(
        (point) => Math.abs(point.gx - portal.gx) < 1e-6 && Math.abs(point.gy - portal.gy) < 1e-6,
      )
      const stop = portalIndex >= 0 ? portalIndex : points!.length - 2
      for (let i = 1; i <= stop; i++) {
        const leg = Math.hypot(
          points![i].gx - points![i - 1].gx,
          points![i].gy - points![i - 1].gy,
        )
        assert.ok(
          leg > 1e-6,
          `${origin.id} -> ${target.id} has a ${leg.toFixed(3)}-tile leg before the sit-down`,
        )
      }

      const total = pathLength(points!)
      let last = headingAlongPath(points!, 0)
      let changes = 0
      for (let d = 0; d <= total; d += 0.05) {
        const heading = headingAlongPath(points!, Math.min(total, d))
        if (heading !== last) {
          changes += 1
          last = heading
        }
      }
      // Full-radius clearance and protected open-side portals sometimes require extra
      // corners; never merge an exempt seat leg into an ordinary walking segment.
      assert.ok(
        changes <= 8,
        `${origin.id} -> ${target.id} changes heading ${changes} times`,
      )
    }
  }
})

test('render geometry and routing footprints share their spec objects and cover drawn extents', () => {
  assert.equal(FURNITURE_FOOTPRINTS.monitors, DESK_MONITOR_BOXES)
  assert.equal(FURNITURE_FOOTPRINTS.chairs, DESK_CHAIR_BOXES)
  assert.equal(FURNITURE_FOOTPRINTS.plantSpecs, PLANT_SPECS)
  assert.equal(FURNITURE_FOOTPRINTS.plants.length, PLANT_SPECS.length)
  FURNITURE_FOOTPRINTS.plants.forEach((box, index) => {
    assert.equal(box, PLANT_SPECS[index].box)
  })

  DESK_SEATS.forEach((seat, index) => {
    const monitor = DESK_MONITOR_BOXES[index]
    const chair = DESK_CHAIR_BOXES[index]
    assert.ok(OBSTACLES.includes(monitor))
    assert.ok(OBSTACLES.includes(chair))
    // Keyboard moved onto the slab: starts at +0.40, ends at +0.62 (formerly +0.68).
    assert.ok(monitor.d >= 0.62, 'monitor footprint includes the keyboard')
    assert.ok(monitor.gx <= seat.gx - 0.32 && monitor.gx + monitor.w >= seat.gx + 0.32)
    assert.ok(monitor.gy + monitor.d >= monitor.gy + 0.4 + 0.22 - 1e-9)
    const bench = DESK_BENCHES[(seat.row ?? 1) - 1]
    assert.ok(monitor.gy >= bench.gy && monitor.gy + monitor.d <= bench.gy + bench.d)
  })

  for (const spec of PLANT_SPECS) {
    assert.ok(OBSTACLES.includes(spec.box))
    assert.ok(Math.abs(spec.box.w - 0.48 * spec.scale) < 1e-9)
    assert.ok(Math.abs(spec.box.d - 0.48 * spec.scale) < 1e-9)
  }

  for (const armchair of [FURNITURE_FOOTPRINTS.armchairNorth, FURNITURE_FOOTPRINTS.armchairSouth]) {
    assert.ok(OBSTACLES.some(box => box.gx >= armchair.gx && box.gy === armchair.gy))
    assert.ok(armchair.w >= 1.0 && armchair.d >= 0.86)
  }
})

test('large roster: 40 characters, 25 working, all valid, separated and out of furniture', () => {
  const entries: Array<[string, ActivityStatus]> = Array.from({ length: 40 }, (_, i) => [
    `roster/m${i}`,
    i < 25 ? 'tool' : 'idle',
  ])
  const state = step(initialPlannerState(), snapshot(entries, 0), 0)
  assert.equal(state.plans.size, 40)

  const positions = [...state.plans.values()].map((plan) => {
    const at = positionAt(plan, 0)
    assert.equal(at.walking, false)
    assert.ok(at.gx > 0 && at.gx < 14 && at.gy > 0 && at.gy < 10, `${plan.char.id} is in the room`)
    return { id: plan.char.id, gx: at.gx, gy: at.gy, seat: plan.seat }
  })

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i]
      const b = positions[j]
      assert.ok(
        Math.hypot(a.gx - b.gx, a.gy - b.gy) >= 0.3,
        `${a.id} and ${b.id} are too close at rest`,
      )
    }
  }

  for (const position of positions) {
    if (position.seat.kind === 'standing' || position.seat.id.startsWith('lx') || position.seat.id.startsWith('lc')) {
      for (const box of OBSTACLES) {
        assert.equal(
          inBox({ gx: position.gx, gy: position.gy }, box),
          false,
          `${position.id} overlaps furniture`,
        )
      }
    }
  }
})
