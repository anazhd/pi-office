import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, appendFile, utimes, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyEvent, emptyState, parseEvent } from '../parse.ts'
import { OfficeStore } from '../sessions.ts'
import { STALE_MS, TOOL_STALE_MS } from '../office.ts'

const NOW = Date.now()
const header = (id: string) => ({ type: 'session', id, cwd: '/fixture/project', timestamp: new Date(NOW).toISOString() })
const message = (role: string, stopReason?: string, isError = false, ts = NOW) => ({
  type: 'message', timestamp: new Date(ts).toISOString(),
  message: { role, stopReason, isError, provider: 'fixture', model: 'model', timestamp: ts,
    toolName: 'bash', content: stopReason === 'toolUse' ? [{ type: 'toolCall', name: 'bash' }] : [], usage: {} },
})
const encode = (events: unknown[]) => events.map(e => JSON.stringify(e)).join('\n') + '\n'
const reduce = (events: unknown[]) => {
  const state = emptyState()
  for (const event of events) applyEvent(state, parseEvent(JSON.stringify(event))!)
  return state
}

// Sanitized observed sequence: toolUse -> failed result -> toolUse -> failed result.
// Failed results do not prove process exit: a new assistant continuation can resume.
test('observed failed tool ordering and successful continuation', () => {
  const events = [message('user'), message('assistant', 'toolUse'), message('toolResult', undefined, true)]
  assert.equal(reduce(events).status, 'idle')
  events.push(message('assistant', 'toolUse'))
  assert.equal(reduce(events).status, 'tool')
  events.push(message('toolResult'))
  assert.equal(reduce(events).status, 'thinking')
  events.push(message('assistant', 'stop'))
  assert.equal(reduce(events).status, 'idle')
})

// Adversarial suffixes on real terminal-message shapes; no private payloads.
for (const reason of ['error', 'aborted', 'stop', 'length']) {
  test(`${reason}: trailing results cannot revive a terminal turn; new turns can`, () => {
    const events = [message('user'), message('assistant', 'toolUse'), message('assistant', reason)]
    events.push(message('toolResult', undefined, false, NOW + 1000))
    events.push(message('toolResult', undefined, true, NOW + 2000))
    const state = reduce(events)
    assert.equal(state.status, 'idle')
    assert.equal(state.lastTs, NOW)
    events.push(message('user', undefined, false, NOW + 3000))
    assert.equal(reduce(events).status, 'thinking')
    events.push(message('assistant', 'toolUse', false, NOW + 4000))
    assert.equal(reduce(events).status, 'tool')
  })
}

test('reader: metadata cannot revive terminal or historical work; concurrent same-model work survives', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'office-activity-'))
  const ended = join(dir, 'ended.jsonl')
  const active = join(dir, 'active.jsonl')
  const abandoned = join(dir, 'abandoned.jsonl')
  const store = new OfficeStore(dir)
  try {
    await writeFile(ended, encode([header('ended'), message('assistant', 'error'), message('toolResult')]))
    await writeFile(active, encode([header('active'), message('assistant', 'toolUse')]))
    await writeFile(abandoned, encode([header('abandoned'), message('assistant', 'toolUse', false, NOW - TOOL_STALE_MS - 1)]))
    await store.refresh()
    assert.equal(store.snapshot(NOW).totals.activeSessions, 1)
    assert.equal(store.snapshot(NOW).characters[0].status, 'tool')
    assert.equal(store.snapshot(NOW + STALE_MS + 1).totals.activeSessions, 1)
    assert.equal(store.snapshot(NOW + TOOL_STALE_MS + 1).totals.activeSessions, 0)
    await utimes(abandoned, new Date(), new Date())
    await appendFile(ended, encode([{ type: 'session_info', timestamp: new Date(NOW + TOOL_STALE_MS).toISOString(), name: 'PRIVATE' }]))
    await store.refresh()
    assert.equal(store.snapshot(NOW + TOOL_STALE_MS + 1).totals.activeSessions, 0)
    await appendFile(ended, encode([message('user', undefined, false, NOW + TOOL_STALE_MS + 1)]))
    await store.refresh()
    assert.equal(store.snapshot(NOW + TOOL_STALE_MS + 1).totals.activeSessions, 1)
    assert.ok(!JSON.stringify(store.snapshot()).includes('PRIVATE'))
  } finally {
    store.stop()
    await rm(dir, { recursive: true, force: true })
  }
})
