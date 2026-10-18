import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STALE_MS,
  buildOfficeSnapshot,
  effectiveStatus,
  levelForXp,
  levelProgress,
  titleForLevel,
  xpForLevel,
  type SessionView,
} from '../office.ts'
import type { RosterEntry } from '../parse.ts'

const NOW = Date.parse('2026-10-18T12:00:00.000Z')

function entry(o: Partial<RosterEntry> & { id: string; provider: string; model: string }): RosterEntry {
  return {
    messages: 1,
    outputTokens: 0,
    inputTokens: 0,
    toolCalls: 0,
    firstSeen: NOW - 100_000,
    lastSeen: NOW - 1000,
    todayOutputTokens: 0,
    sessions: 1,
    ...o,
  }
}

function session(o: Partial<SessionView> = {}): SessionView {
  return {
    key: 'k1',
    project: 'pi-office',
    status: 'thinking',
    tool: null,
    since: NOW - 1000,
    mtime: NOW - 500,
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    ...o,
  }
}

test('level math: thresholds, titles, progress', () => {
  assert.equal(levelForXp(0), 1)
  assert.equal(levelForXp(-5), 1)
  assert.equal(levelForXp(1999), 1)
  assert.equal(levelForXp(2000), 2)
  assert.equal(levelForXp(7999), 2)
  assert.equal(levelForXp(8000), 3)
  assert.equal(levelForXp(18000), 4) // floor(sqrt(9)) + 1
  assert.equal(xpForLevel(1), 0)
  assert.equal(xpForLevel(2), 2000)
  assert.equal(xpForLevel(3), 8000)

  assert.equal(levelProgress(0), 0)
  assert.equal(levelProgress(1000), 0.5)
  assert.equal(levelProgress(2000), 0)
  assert.equal(levelProgress(5000), 0.5) // level 2: 2000..8000
  assert.equal(levelProgress(-10), 0)
  assert.ok(levelProgress(10_000_000) <= 1)
})

test('titles by level band', () => {
  const expected: Array<[number, string]> = [
    [1, 'Intern'],
    [2, 'Intern'],
    [3, 'Junior'],
    [4, 'Junior'],
    [5, 'Engineer'],
    [7, 'Engineer'],
    [8, 'Senior'],
    [11, 'Senior'],
    [12, 'Staff'],
    [16, 'Staff'],
    [17, 'Principal'],
    [99, 'Principal'],
  ]
  for (const [level, title] of expected) assert.equal(titleForLevel(level), title, String(level))
})

test('effectiveStatus: stale timeout applies to non-idle sessions only', () => {
  assert.equal(effectiveStatus(session({ mtime: NOW - 1000 }), NOW), 'thinking')
  assert.equal(effectiveStatus(session({ mtime: NOW - STALE_MS + 1 }), NOW), 'thinking')
  assert.equal(effectiveStatus(session({ mtime: NOW - STALE_MS - 1 }), NOW), 'idle')
  assert.equal(effectiveStatus(session({ status: 'tool', tool: 'bash', mtime: NOW - STALE_MS - 1 }), NOW), 'idle')
  // idle stays idle regardless of mtime
  assert.equal(effectiveStatus(session({ status: 'idle', mtime: NOW }), NOW), 'idle')
  // no model -> cannot be working
  assert.equal(effectiveStatus(session({ model: null }), NOW), 'idle')
})

test('snapshot: characters sorted by firstSeen, levels and totals', () => {
  const roster = [
    entry({
      id: 'anthropic/claude-opus-5-5',
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      outputTokens: 2000,
      inputTokens: 300,
      toolCalls: 4,
      messages: 9,
      sessions: 2,
      todayOutputTokens: 500,
      firstSeen: NOW - 50_000,
      lastSeen: NOW - 2000,
    }),
    entry({
      id: 'openai-codex/gpt-6.1-sol',
      provider: 'openai-codex',
      model: 'gpt-6.1-sol',
      outputTokens: 0,
      firstSeen: NOW - 90_000,
    }),
  ]
  const snap = buildOfficeSnapshot({
    now: NOW,
    sessions: [session()],
    roster,
    nameFor: (_p, m) => `name:${m}`,
  })

  assert.equal(snap.now, NOW)
  assert.deepEqual(
    snap.characters.map((c) => c.id),
    ['openai-codex/gpt-6.1-sol', 'anthropic/claude-opus-5-5'],
  )
  const opus = snap.characters[1]
  assert.equal(opus.displayName, 'name:claude-opus-5-5')
  assert.equal(opus.level, 2)
  assert.equal(opus.title, 'Intern')
  assert.equal(opus.xp, 2000)
  assert.equal(opus.status, 'thinking')
  assert.deepEqual(opus.active, [
    { key: 'k1', project: 'pi-office', status: 'thinking', tool: null, since: NOW - 1000 },
  ])
  assert.deepEqual(opus.stats, {
    messages: 9,
    outputTokens: 2000,
    inputTokens: 300,
    toolCalls: 4,
    sessions: 2,
    todayOutputTokens: 500,
    firstSeen: NOW - 50_000,
    lastSeen: NOW - 2000,
  })
  assert.deepEqual(snap.totals, {
    activeSessions: 1,
    workingCharacters: 1,
    todayOutputTokens: 500,
    lifetimeOutputTokens: 2000,
  })
})

test('snapshot: tool wins over thinking, active sessions newest first', () => {
  const snap = buildOfficeSnapshot({
    now: NOW,
    sessions: [
      session({ key: 'a', status: 'thinking', since: NOW - 5000 }),
      session({ key: 'b', status: 'tool', tool: 'edit', since: NOW - 1000 }),
      session({ key: 'c', status: 'tool', tool: 'read', since: NOW - 3000 }),
    ],
    roster: [entry({ id: 'anthropic/claude-opus-5-5', provider: 'anthropic', model: 'claude-opus-5-5' })],
    nameFor: (_p, m) => m,
  })
  const c = snap.characters[0]
  assert.equal(c.status, 'tool')
  assert.deepEqual(
    c.active.map((a) => a.key),
    ['b', 'c', 'a'],
  )
  assert.equal(c.active[0].tool, 'edit')
  assert.equal(snap.totals.activeSessions, 3)
  assert.equal(snap.totals.workingCharacters, 1)
})

test('snapshot: stale and model-less sessions do not count as active', () => {
  const snap = buildOfficeSnapshot({
    now: NOW,
    sessions: [
      session({ key: 'stale', mtime: NOW - STALE_MS * 2 }),
      session({ key: 'nomodel', provider: null, model: null }),
      session({ key: 'idle', status: 'idle' }),
    ],
    roster: [entry({ id: 'anthropic/claude-opus-5-5', provider: 'anthropic', model: 'claude-opus-5-5' })],
    nameFor: (_p, m) => m,
  })
  assert.equal(snap.totals.activeSessions, 0)
  assert.equal(snap.characters[0].status, 'idle')
  assert.deepEqual(snap.characters[0].active, [])
})

test('snapshot: empty roster -> empty characters', () => {
  const snap = buildOfficeSnapshot({ now: NOW, sessions: [], roster: [], nameFor: (_p, m) => m })
  assert.deepEqual(snap.characters, [])
  assert.deepEqual(snap.totals, {
    activeSessions: 0,
    workingCharacters: 0,
    todayOutputTokens: 0,
    lifetimeOutputTokens: 0,
  })
})

test('snapshot: active[0] is a tool session even when a thinking session is newer', () => {
  const snap = buildOfficeSnapshot({
    now: NOW,
    sessions: [
      session({ key: 'thinking-newest', status: 'thinking', since: NOW - 1000 }),
      session({ key: 'tool-older', status: 'tool', tool: 'bash', since: NOW - 5000 }),
      session({ key: 'thinking-old', status: 'thinking', since: NOW - 8000 }),
    ],
    roster: [entry({ id: 'anthropic/claude-opus-5-5', provider: 'anthropic', model: 'claude-opus-5-5' })],
    nameFor: (_p, m) => m,
  })
  const c = snap.characters[0]
  assert.equal(c.status, 'tool')
  assert.deepEqual(
    c.active.map((a) => a.key),
    ['tool-older', 'thinking-newest', 'thinking-old'],
  )
})
