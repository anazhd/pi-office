import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateRoster, IncrementalRoster, type CompactContribution, type Contribution } from '../parse.ts'

function compact(o: Partial<CompactContribution> & { key: string; charId: string }): CompactContribution {
  return {
    out: 10,
    inp: 2,
    tools: 0,
    ts: 1_000,
    sessionId: 's1',
    ...o,
  }
}

function full(c: CompactContribution): Contribution {
  const slash = c.charId.indexOf('/')
  return {
    key: c.key,
    provider: c.charId.slice(0, slash),
    model: c.charId.slice(slash + 1),
    modelId: c.charId,
    out: c.out,
    inp: c.inp,
    tools: c.tools,
    ts: c.ts,
    sessionId: c.sessionId,
  }
}

test('incremental roster matches full aggregation (dedupe, sessions, today)', () => {
  const dayStart = 1_000
  const records: Array<[string, CompactContribution]> = [
    ['a', compact({ key: 'k1', charId: 'anthropic/claude', out: 100, ts: 1_100, sessionId: 's1' })],
    ['a', compact({ key: 'k2', charId: 'anthropic/claude', out: 50, ts: 900, sessionId: 's2', tools: 2 })],
    ['b', compact({ key: 'k2', charId: 'anthropic/claude', out: 50, ts: 900, sessionId: 's3', tools: 2 })],
    ['b', compact({ key: 'k3', charId: 'openai/gpt', out: 7, ts: 1_200, sessionId: 's4' })],
  ]
  const roster = new IncrementalRoster(dayStart)
  for (const [owner, c] of records) roster.add(c, owner)
  const expected = aggregateRoster(
    records.map(([, c]) => full(c)),
    dayStart,
  )
  const actual = new Map([...roster.entries()].map((e) => [e.id, e]))
  assert.deepEqual(
    actual.get('anthropic/claude'),
    expected.get('anthropic/claude'),
  )
  assert.deepEqual(actual.get('openai/gpt'), expected.get('openai/gpt'))
})

test('incremental roster subtracts exactly; a duplicate is promoted when the canonical copy goes', () => {
  const roster = new IncrementalRoster(0)
  const a = compact({ key: 'same', charId: 'anthropic/claude', out: 100, ts: 10, sessionId: 's1' })
  const b = compact({ key: 'same', charId: 'anthropic/claude', out: 100, ts: 10, sessionId: 's2' })
  roster.add(a, 'file-a')
  roster.add(b, 'file-b')
  let entry = [...roster.entries()][0]
  assert.equal(entry.messages, 1)
  assert.equal(entry.sessions, 1)

  roster.remove(a, 'file-a')
  entry = [...roster.entries()][0]
  assert.equal(entry.messages, 1)
  assert.equal(entry.outputTokens, 100)
  assert.equal(entry.sessions, 1) // promoted duplicate now represents the reply

  roster.remove(b, 'file-b')
  assert.equal([...roster.entries()].length, 0)
})

test('incremental roster repairs first/last bounds after a removal', () => {
  const roster = new IncrementalRoster(0)
  const first = compact({ key: 'k1', charId: 'a/m', ts: 10 })
  const middle = compact({ key: 'k2', charId: 'a/m', ts: 20 })
  const last = compact({ key: 'k3', charId: 'a/m', ts: 30 })
  roster.add(first, 'f')
  roster.add(middle, 'f')
  roster.add(last, 'f')
  roster.remove(first, 'f')
  roster.remove(last, 'f')
  const entry = [...roster.entries()][0]
  assert.equal(entry.messages, 1)
  assert.equal(entry.firstSeen, 20)
  assert.equal(entry.lastSeen, 20)
})

test('incremental roster recomputes today at local midnight only', () => {
  const roster = new IncrementalRoster(1_000)
  roster.add(compact({ key: 'old', charId: 'a/m', out: 30, ts: 500, sessionId: 's1' }), 'f')
  roster.add(compact({ key: 'new', charId: 'a/m', out: 70, ts: 1_500, sessionId: 's1' }), 'f')
  let entry = [...roster.entries()][0]
  assert.equal(entry.todayOutputTokens, 70)
  assert.equal(entry.outputTokens, 100)

  roster.setDay(2_000)
  entry = [...roster.entries()][0]
  assert.equal(entry.todayOutputTokens, 0)
  assert.equal(entry.outputTokens, 100)

  roster.add(compact({ key: 'next', charId: 'a/m', out: 5, ts: 2_100, sessionId: 's2' }), 'f')
  entry = [...roster.entries()][0]
  assert.equal(entry.todayOutputTokens, 5)
  assert.equal(entry.sessions, 2)
})
