import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateRoster,
  applyEvent,
  emptyState,
  parseChunk,
  parseEvent,
  projectName,
  sessionKey,
} from '../parse.ts'

const line = (o: unknown) => JSON.stringify(o)

const sessionLine = line({
  type: 'session',
  id: 'sess-1',
  timestamp: '2026-10-18T10:00:00.000Z',
  cwd: '/root/github/pi-office',
})
const modelChangeLine = line({
  type: 'model_change',
  timestamp: '2026-10-18T10:00:01.000Z',
  provider: 'anthropic',
  modelId: 'claude-opus-5-5',
})
const userLine = line({
  type: 'message',
  timestamp: '2026-10-18T10:00:05.000Z',
  message: { role: 'user', timestamp: 1792000000000, content: [{ type: 'text', text: 'SECRET PROMPT' }] },
})
const assistantLine = line({
  type: 'message',
  timestamp: '2026-10-18T10:00:10.000Z',
  message: {
    role: 'assistant',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    stopReason: 'toolUse',
    timestamp: 1792000005000,
    durationMs: 5000,
    usage: { input: 10, output: 100, cacheRead: 50, cacheWrite: 5, totalTokens: 165 },
    content: [
      { type: 'text', text: 'SECRET THINKING' },
      { type: 'toolCall', name: 'read', arguments: { path: 'SECRET ARG' } },
      { type: 'toolCall', name: 'bash', arguments: { command: 'SECRET CMD' } },
    ],
  },
})
const toolResultLine = line({
  type: 'message',
  timestamp: '2026-10-18T10:00:20.000Z',
  message: {
    role: 'toolResult',
    toolCallId: 'x',
    toolName: 'bash',
    timestamp: 1792000010000,
    content: [{ type: 'text', text: 'SECRET TOOL OUTPUT' }],
  },
})
const stopLine = line({
  type: 'message',
  timestamp: '2026-10-18T10:00:30.000Z',
  message: {
    role: 'assistant',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    stopReason: 'stop',
    timestamp: 1792000020000,
    usage: { input: 1, output: 200, cacheRead: 0, cacheWrite: 0 },
    content: [{ type: 'text', text: 'SECRET ANSWER' }],
  },
})

test('parseEvent: header, model_change, user, toolResult, assistant', () => {
  const header = parseEvent(sessionLine)
  assert.deepEqual(header, {
    kind: 'session',
    id: 'sess-1',
    project: 'pi-office',
    ts: Date.parse('2026-10-18T10:00:00.000Z'),
  })

  assert.deepEqual(parseEvent(modelChangeLine), {
    kind: 'modelChange',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    ts: Date.parse('2026-10-18T10:00:01.000Z'),
  })

  assert.deepEqual(parseEvent(userLine), { kind: 'user', ts: Date.parse('2026-10-18T10:00:05.000Z') })

  assert.deepEqual(parseEvent(toolResultLine), {
    kind: 'toolResult',
    toolName: 'bash',
    ts: Date.parse('2026-10-18T10:00:20.000Z'),
  })

  const a = parseEvent(assistantLine)
  assert.equal(a?.kind, 'assistant')
  if (a?.kind !== 'assistant') return
  assert.equal(a.provider, 'anthropic')
  assert.equal(a.model, 'claude-opus-5-5')
  assert.equal(a.stopReason, 'toolUse')
  assert.deepEqual(a.tools, ['read', 'bash'])
  assert.equal(a.out, 100)
  assert.equal(a.inp, 65) // input + cacheRead + cacheWrite
  assert.equal(a.startedAt, 1792000005000)
})

test('parseEvent: ignores irrelevant, unknown, partial and corrupt lines', () => {
  const irrelevant = [
    line({ type: 'thinking_level_change', timestamp: '2026-10-18T10:00:00.000Z', thinkingLevel: 'low' }),
    line({ type: 'session_info', timestamp: '2026-10-18T10:00:00.000Z', name: 'SECRET TITLE' }),
    line({ type: 'custom', data: 'SECRET' }),
    line({ type: 'message', message: { role: 'system', content: 'SECRET' } }),
    '{"type":"message","message":{"role":"assistant"', // half-written
    'not json at all',
    '',
  ]
  for (const l of irrelevant) assert.equal(parseEvent(l), null, l.slice(0, 40))
})

test('parseChunk: only consumes complete lines', () => {
  const chunk = sessionLine + '\n' + userLine + '\n' + '{"type":"mess'
  const { events, consumed } = parseChunk(chunk)
  assert.deepEqual(
    events.map((e) => e.kind),
    ['session', 'user'],
  )
  assert.equal(chunk.slice(consumed), '{"type":"mess')
})

test('applyEvent: starts idle', () => {
  const s = emptyState()
  assert.equal(s.status, 'idle')
  assert.equal(s.model, null)
})

test('applyEvent: model_change / header only -> idle', () => {
  const s = emptyState()
  applyEvent(s, parseEvent(sessionLine)!)
  assert.equal(s.status, 'idle')
  applyEvent(s, parseEvent(modelChangeLine)!)
  assert.equal(s.status, 'idle')
  assert.equal(s.provider, 'anthropic')
  assert.equal(s.model, 'claude-opus-5-5')
  assert.equal(s.project, 'pi-office')
})

test('applyEvent: user message -> thinking', () => {
  const s = emptyState()
  applyEvent(s, parseEvent(sessionLine)!)
  applyEvent(s, parseEvent(userLine)!)
  assert.equal(s.status, 'thinking')
  assert.equal(s.tool, null)
})

test('applyEvent: assistant toolUse -> tool with last toolCall name', () => {
  const s = emptyState()
  applyEvent(s, parseEvent(sessionLine)!)
  applyEvent(s, parseEvent(userLine)!)
  applyEvent(s, parseEvent(assistantLine)!)
  assert.equal(s.status, 'tool')
  assert.equal(s.tool, 'bash')
  assert.equal(s.contributions.length, 1)
  assert.equal(s.contributions[0].out, 100)
  assert.equal(s.contributions[0].tools, 2)
  assert.equal(s.contributions[0].sessionId, 'sess-1')
})

test('applyEvent: toolResult -> thinking again', () => {
  const s = emptyState()
  applyEvent(s, parseEvent(sessionLine)!)
  applyEvent(s, parseEvent(assistantLine)!)
  assert.equal(s.status, 'tool')
  applyEvent(s, parseEvent(toolResultLine)!)
  assert.equal(s.status, 'thinking')
  assert.equal(s.tool, null)
})

test('applyEvent: assistant stop/error/aborted/length -> idle', () => {
  for (const stopReason of ['stop', 'error', 'aborted', 'length']) {
    const s = emptyState()
    applyEvent(s, parseEvent(userLine)!)
    assert.equal(s.status, 'thinking')
    const ev = parseEvent(
      line({
        type: 'message',
        timestamp: '2026-10-18T10:00:30.000Z',
        message: {
          role: 'assistant',
          provider: 'anthropic',
          model: 'claude-opus-5-5',
          stopReason,
          timestamp: 1792000020000,
          usage: { input: 1, output: 5 },
          content: [],
        },
      }),
    )!
    applyEvent(s, ev)
    assert.equal(s.status, 'idle', stopReason)
    assert.equal(s.tool, null)
  }
})

test('applyEvent: model of the session is last assistant model', () => {
  const s = emptyState()
  applyEvent(s, parseEvent(modelChangeLine)!)
  applyEvent(
    s,
    parseEvent(
      line({
        type: 'message',
        timestamp: '2026-10-18T10:00:30.000Z',
        message: {
          role: 'assistant',
          provider: 'openai-codex',
          model: 'gpt-6.1-sol',
          stopReason: 'stop',
          timestamp: 1792000020000,
          usage: { input: 1, output: 5 },
          content: [],
        },
      }),
    )!,
  )
  assert.equal(s.provider, 'openai-codex')
  assert.equal(s.model, 'gpt-6.1-sol')
})

test('aggregateRoster: aggregates, dedupes forks, counts sessions and today', () => {
  const now = Date.parse('2026-10-18T12:00:00.000Z')
  const dayStart = Date.parse('2026-10-18T00:00:00.000Z')
  const mk = (o: {
    key: string
    out: number
    inp: number
    tools?: number
    ts: number
    sessionId: string
    model?: string
  }) => ({
    key: o.key,
    provider: 'anthropic',
    model: o.model ?? 'claude-opus-5-5',
    modelId: `anthropic/${o.model ?? 'claude-opus-5-5'}`,
    out: o.out,
    inp: o.inp,
    tools: o.tools ?? 0,
    ts: o.ts,
    sessionId: o.sessionId,
  })
  const roster = aggregateRoster(
    [
      mk({ key: 'a:1', out: 100, inp: 10, tools: 2, ts: dayStart + 1000, sessionId: 's1' }),
      mk({ key: 'a:2', out: 50, inp: 5, tools: 1, ts: dayStart + 2000, sessionId: 's1' }),
      mk({ key: 'a:2', out: 50, inp: 5, tools: 1, ts: dayStart + 2000, sessionId: 's2' }), // forked copy
      mk({ key: 'a:3', out: 7, inp: 3, ts: dayStart - 5000, sessionId: 's2' }), // before today
    ],
    dayStart,
  )
  const e = roster.get('anthropic/claude-opus-5-5')!
  assert.equal(e.messages, 3) // duplicate key counted once
  assert.equal(e.outputTokens, 157)
  assert.equal(e.inputTokens, 18)
  assert.equal(e.toolCalls, 3)
  assert.equal(e.sessions, 2)
  assert.equal(e.firstSeen, dayStart - 5000)
  assert.equal(e.lastSeen, dayStart + 2000)
  assert.equal(e.todayOutputTokens, 150)
  assert.ok(now > e.lastSeen)
})

test('aggregateRoster: keeps models separate', () => {
  const roster = aggregateRoster(
    [
      {
        key: 'k1',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4.1-flash-1017',
        modelId: 'openrouter/deepseek/deepseek-v4.1-flash-1017',
        out: 1,
        inp: 1,
        tools: 0,
        ts: 1,
        sessionId: 's',
      },
      {
        key: 'k2',
        provider: 'openai-codex',
        model: 'gpt-6.1-sol',
        modelId: 'openai-codex/gpt-6.1-sol',
        out: 1,
        inp: 1,
        tools: 0,
        ts: 1,
        sessionId: 's',
      },
    ],
    0,
  )
  assert.deepEqual([...roster.keys()].sort(), [
    'openai-codex/gpt-6.1-sol',
    'openrouter/deepseek/deepseek-v4.1-flash-1017',
  ])
})

test('projectName: basename only', () => {
  assert.equal(projectName('/root/github/pi-office'), 'pi-office')
  assert.equal(projectName('/root/github/pi-office/'), 'pi-office')
  assert.equal(projectName('C:\\work\\thing'), 'thing')
  assert.equal(projectName(''), 'unknown')
})

test('sessionKey: short, stable, never the id', () => {
  const k = sessionKey('01a14f37-049c-71b9-a77e-e41d2d971377')
  assert.equal(k.length, 10)
  assert.match(k, /^[0-9a-f]{10}$/)
  assert.equal(k, sessionKey('01a14f37-049c-71b9-a77e-e41d2d971377'))
  assert.notEqual(k, sessionKey('01a14f37-049c-71b9-a77e-e41d2d971378'))
  assert.ok(!k.includes('01a14f37'))
})
