import test from 'node:test'
import assert from 'node:assert/strict'
import { initialPlannerState, step, positionAt } from '../scene-planner.ts'
import { LOUNGE_SEATS } from '../layout.ts'
import type { OfficeSnapshot } from '../../../shared/office-types.ts'
import { DESK_GRACE_MS } from '../../../shared/desk-allocation.ts'

// Minimal snapshot independent of live logs. `desk` is the server's assignment (grace is server-side now).
const snapshot = (status: 'tool' | 'idle', desk: number | null): OfficeSnapshot => ({
  now: 1, characters: [{ id: 'p/m', provider: 'p', model: 'm', displayName: 'M',
    status, desk, active: [], stats: { messages: 1, outputTokens: 1, inputTokens: 1,
      toolCalls: 1, sessions: 1, todayOutputTokens: 1, firstSeen: 1, lastSeen: 1 },
    xp: 1, level: 1, title: 'Intern', levelProgress: 0 }],
  totals: { activeSessions: 0, workingCharacters: 0, todayOutputTokens: 1, lifetimeOutputTokens: 1 },
})

test('a server-released desk sends the worker to the lounge even after a hidden-tab clock jump', () => {
  let state = step(initialPlannerState(), snapshot('tool', 0), 0)
  state = step(state, snapshot('idle', 0), 1000)
  // The tab slept; the next server snapshot has already released the desk.
  state = step(state, snapshot('idle', null), 1000 + DESK_GRACE_MS + 60_000)
  const plan = state.plans.get('p/m')!
  assert.equal(plan.deskIndex, null)
  assert.ok(positionAt(plan, plan.walkStart).walking)
})

test('blocked departure settles between retries, then recovers on the clock alone', () => {
  let state = step(initialPlannerState(), snapshot('tool', 0), 0)
  state = step(state, snapshot('idle', 0), 1000)
  const target = LOUNGE_SEATS[0]
  const original = { gx: target.gx, gy: target.gy }
  try {
    // Block the lounge departure before the server releases the desk.
    target.gx = 11
    target.gy = 6.1
    const released = snapshot('idle', null)
    const now = 1000 + DESK_GRACE_MS
    state = step(state, released, now)
    assert.equal(state.plans.get('p/m')!.deskIndex, 0, 'held at the desk while no route exists')
    assert.equal(step(state, released, now), state, 'React effect must settle, not commit forever')
    assert.equal(step(state, released, now + 999), state)

    target.gx = original.gx
    target.gy = original.gy
    state = step(state, released, now + 1000)
    assert.equal(state.desks.has('p/m'), false)
    assert.ok(state.plans.get('p/m')!.walkDuration > 0)
  } finally { Object.assign(target, original) }
})
