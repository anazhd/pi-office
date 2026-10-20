// Regression: a working worker at its server-assigned desk lights exactly that desk's monitor, and only that one.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { ActivityStatus, Character, OfficeSnapshot } from '../../../shared/office-types.ts'
import {
  candidatesFor,
  DESK_COUNT,
  emptyDeskPlan,
  reconcileDesks,
  withDesks,
  type DeskPick,
} from '../../../shared/desk-allocation.ts'
import { deskLights, type DeskLightInput } from '../desk-lights.ts'
import { DESK_SEATS } from '../layout.ts'
import { FURNITURE_FOOTPRINTS as F } from '../footprints.ts'
import { initialPlannerState, poseFor, positionAt, step, WALK_MAX_MS, type PlannerState } from '../scene-planner.ts'

function character(id: string, status: ActivityStatus, desk: number | null): Character {
  return {
    id,
    provider: id.split('/')[0],
    model: id.split('/')[1] ?? id,
    displayName: id,
    stats: { messages: 1, outputTokens: 1, inputTokens: 1, toolCalls: 0, sessions: 1, todayOutputTokens: 0, firstSeen: 0, lastSeen: 0 },
    level: 1,
    title: 'Intern',
    xp: 0,
    levelProgress: 0,
    status,
    desk,
    active: [],
  }
}

function snapshotOf(entries: Array<[string, ActivityStatus, number | null]>, now: number): OfficeSnapshot {
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

test('deskLights: only a typing worker lights its desk; relaxing seats the chair without lighting', () => {
  const scenes: DeskLightInput[] = [
    { deskIndex: 0, pose: 'typing' },
    { deskIndex: 9, pose: 'typing' },
    { deskIndex: 4, pose: 'relaxing' },
    { deskIndex: 6, pose: 'walking' },
    { deskIndex: 2, pose: 'waiting' },
    { deskIndex: null, pose: 'seated' },
  ]
  const { lit, seated } = deskLights(scenes)
  assert.deepEqual([...lit].sort((a, b) => a - b), [0, 9])
  assert.deepEqual([...seated].sort((a, b) => a - b), [0, 4, 9])
})

test('poseFor: a server desk lights only once the worker has arrived, and goes dark when it goes idle', () => {
  let state = step(initialPlannerState(), snapshotOf([['p/a', 'idle', null]], 0), 0)
  state = step(state, snapshotOf([['p/a', 'tool', 7]], 1000), 1000)
  const plan = state.plans.get('p/a')!
  assert.equal(plan.deskIndex, 7)
  assert.equal(poseFor(plan, 1000), 'walking')
  const arrived = 1000 + plan.walkDuration + 1
  assert.equal(poseFor(plan, arrived), 'typing')
  assert.deepEqual([...deskLights([{ deskIndex: plan.deskIndex, pose: poseFor(plan, arrived) }]).lit], [7])

  // Idle inside the server's grace window: still at the desk, chair occupied, monitor dark.
  state = step(state, snapshotOf([['p/a', 'idle', 7]], arrived + 5000), arrived + 5000)
  const idle = state.plans.get('p/a')!
  assert.equal(poseFor(idle, arrived + 5000), 'relaxing')
  assert.equal(deskLights([{ deskIndex: idle.deskIndex, pose: 'relaxing' }]).lit.size, 0)
})

test('monitor i is the one on seat i: same bench row, centred on the seat, behind it', () => {
  DESK_SEATS.forEach((seat, i) => {
    const box = F.monitors[i]
    const bench = F.deskBenches[seat.row! - 1]
    const centre = box.gx + box.w / 2
    assert.ok(Math.abs(centre - seat.gx) < 1e-9, `monitor ${i} is centred on seat ${seat.id}`)
    assert.ok(box.gy >= bench.gy && box.gy + box.d <= bench.gy + bench.d + 1e-9, `monitor ${i} sits on its own bench`)
    assert.ok(box.gy + box.d < seat.gy, `monitor ${i} is behind seat ${seat.id}, not in front of it`)
    const chair = F.chairs[i]
    assert.ok(Math.abs(chair.gx + chair.w / 2 - seat.gx) < 0.35, `chair ${i} sits under seat ${seat.id}`)
  })
})

test('churn with random server desks: every settled worker lights its own desk, and nothing else lights', () => {
  const seeds = 25
  const ticks = 480
  const TICK_MS = 250
  let settledChecks = 0
  let litChecks = 0
  for (let seed = 1; seed <= seeds; seed++) {
    const rng = seeded(seed)
    const pick: DeskPick = (free) => free[Math.floor(rng() * free.length)]
    const ids = Array.from({ length: 4 + Math.floor(rng() * 12) }, (_, i) => `p/m${i}`)
    const status = new Map(ids.map((id) => [id, (rng() < 0.5 ? 'idle' : 'thinking') as ActivityStatus]))
    let plan = emptyDeskPlan()
    let state: PlannerState = initialPlannerState()
    let served: OfficeSnapshot | null = null
    // When each character last changed (status or desk); drives the "settled" check.
    const since = new Map<string, { key: string; at: number }>()
    let now = 1_000_000

    for (let tick = 0; tick < ticks; tick++) {
      now += TICK_MS
      if (tick % 3 === 0) {
        for (const id of ids) if (rng() < 0.04) status.set(id, status.get(id) === 'idle' ? 'tool' : 'idle')
        const roster = snapshotOf(ids.map((id) => [id, status.get(id)!, null]), now)
        plan = reconcileDesks(plan, candidatesFor(roster), now, pick)
        served = withDesks(roster, plan.assignments)
        state = step(state, served, now)
      } else {
        state = step(state, state.lastSnapshot, now)
      }

      const scenes = [...state.plans.values()].map((p) => ({ deskIndex: p.deskIndex, pose: poseFor(p, now), plan: p }))
      const { lit } = deskLights(scenes)
      const workingDesks = new Set<number>()

      for (const served_ of served!.characters) {
        const p = state.plans.get(served_.id)!
        const desk = served_.desk
        const working = served_.status !== 'idle'
        if (working && desk != null) workingDesks.add(desk)

        // The planner never disagrees with the server about who holds which desk.
        assert.equal(p.deskIndex, desk, `seed ${seed} t${tick} ${served_.id}: planner desk ${p.deskIndex} vs server ${desk}`)

        const key = `${served_.status}:${desk}`
        const prev = since.get(served_.id)
        if (!prev || prev.key !== key) since.set(served_.id, { key, at: now })
        const settled = now - since.get(served_.id)!.at > WALK_MAX_MS + 2 * TICK_MS
        if (working && desk != null && settled && !positionAt(p, now).walking) {
          settledChecks++
          assert.ok(lit.has(desk), `seed ${seed} t${tick} ${served_.id} is working at settled desk ${desk} but it is dark`)
        }
      }

      for (const desk of lit) {
        litChecks++
        assert.ok(workingDesks.has(desk), `seed ${seed} t${tick}: desk ${desk} lit with no working holder`)
        assert.ok(desk >= 0 && desk < DESK_COUNT)
      }
    }
  }
  assert.ok(settledChecks > 500, `enough settled working checks ran (${settledChecks})`)
  assert.ok(litChecks > 500, `enough lit desks were observed (${litChecks})`)
})
