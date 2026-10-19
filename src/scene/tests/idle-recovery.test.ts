import test from 'node:test'
import assert from 'node:assert/strict'
import { initialPlannerState, step, DESK_GRACE_MS, positionAt } from '../scene-planner.ts'
import { LOUNGE_SEATS } from '../layout.ts'
import type { OfficeSnapshot } from '../../../shared/office-types.ts'
import { readFileSync } from 'node:fs'

// Minimal snapshot independent of live logs.
const snapshot = (status: 'tool' | 'idle'): OfficeSnapshot => ({
  now: 1, characters: [{ id: 'p/m', provider: 'p', model: 'm', displayName: 'M',
    status, active: [], stats: { messages: 1, outputTokens: 1, inputTokens: 1,
      toolCalls: 1, sessions: 1, todayOutputTokens: 1, firstSeen: 1, lastSeen: 1 },
    xp: 1, level: 1, title: 'Intern', levelProgress: 0 }],
  totals: { activeSessions: 0, workingCharacters: 0, todayOutputTokens: 1, lifetimeOutputTokens: 1 },
})

test('hidden-tab clock jump expires grace with the exact same snapshot', () => {
  let state = step(initialPlannerState(), snapshot('tool'), 0)
  const idle = snapshot('idle')
  state = step(state, idle, 1000)
  state = step(state, idle, 1000 + DESK_GRACE_MS + 60_000)
  const plan = state.plans.get('p/m')!
  assert.equal(plan.deskIndex, null)
  assert.ok(positionAt(plan, plan.walkStart).walking)
})

test('blocked departure settles between retries, then recovers on the clock alone', () => {
  let state = step(initialPlannerState(), snapshot('tool'), 0)
  const idle = snapshot('idle')
  state = step(state, idle, 1000)
  const target = LOUNGE_SEATS[0]
  const original = { gx: target.gx, gy: target.gy }
  try {
    target.gx = 11
    target.gy = 6.1
    const now = 1000 + DESK_GRACE_MS
    state = step(state, idle, now)
    assert.equal(state.desks.get('p/m'), 0)
    assert.equal(step(state, idle, now), state, 'React effect must settle, not commit forever')
    assert.equal(step(state, idle, now + 999), state)
    target.gx = original.gx
    target.gy = original.gy
    state = step(state, idle, now + 1000)
    assert.equal(state.desks.has('p/m'), false)
    assert.ok(state.plans.get('p/m')!.walkDuration > 0)
  } finally { Object.assign(target, original) }
})
