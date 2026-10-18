// Integration-ish tests for the I/O layer: real temp directories, real files, no ~/.pi access.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, appendFile, truncate, rename, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OfficeStore, startOfLocalDay } from '../sessions.ts'

const SECRETS = [
  'SECRET USER PROMPT',
  'SECRET SESSION TITLE',
  'SECRET THINKING',
  'SECRET TOOL ARG',
  'SECRET TOOL OUTPUT',
  'SECRET FINAL ANSWER',
]

const line = (o: unknown) => JSON.stringify(o) + '\n'

function header(id: string, cwd = '/root/github/pi-office') {
  return line({ type: 'session', id, timestamp: '2026-10-18T10:00:00.000Z', cwd })
}

function modelChange(provider: string, modelId: string) {
  return line({ type: 'model_change', timestamp: '2026-10-18T10:00:01.000Z', provider, modelId })
}

function user() {
  return line({
    type: 'message',
    timestamp: '2026-10-18T10:00:05.000Z',
    message: {
      role: 'user',
      timestamp: Date.now(),
      content: [{ type: 'text', text: SECRETS[0] }],
    },
  })
}

function assistant(o: { stopReason: string; output?: number; tool?: string; start?: number }) {
  return line({
    type: 'message',
    timestamp: new Date().toISOString(),
    message: {
      role: 'assistant',
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      stopReason: o.stopReason,
      timestamp: o.start ?? Date.now() - 1000,
      usage: { input: 10, output: o.output ?? 100, cacheRead: 5, cacheWrite: 0 },
      content: [
        { type: 'text', text: SECRETS[2] },
        ...(o.tool ? [{ type: 'toolCall', name: o.tool, arguments: { q: SECRETS[3] } }] : []),
        { type: 'text', text: SECRETS[5] },
      ],
    },
  })
}

function toolResult() {
  return line({
    type: 'message',
    timestamp: new Date().toISOString(),
    message: {
      role: 'toolResult',
      toolName: 'bash',
      timestamp: Date.now(),
      content: [{ type: 'text', text: SECRETS[4] }],
    },
  })
}

async function withStore(fn: (dir: string, store: OfficeStore) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'pi-office-test-'))
  const store = new OfficeStore(dir)
  try {
    await fn(dir, store)
  } finally {
    store.stop()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

test('store: reads sessions, derives status, aggregates roster', async () => {
  await withStore(async (dir, store) => {
    const sub = join(dir, '--root-github-pi-office--')
    await mkdir(sub, { recursive: true })
    const file = join(sub, '2026-10-18T10-00-00-000Z_aaa.jsonl')
    await writeFile(
      file,
      header('sess-aaa') +
        modelChange('anthropic', 'claude-opus-5-5') +
        line({ type: 'session_info', timestamp: '2026-10-18T10:00:02.000Z', name: SECRETS[1] }) +
        user() +
        assistant({ stopReason: 'toolUse', tool: 'bash' }),
    )

    await store.start()
    let snap = store.snapshot()
    assert.equal(snap.characters.length, 1)
    const c = snap.characters[0]
    assert.equal(c.id, 'anthropic/claude-opus-5-5')
    assert.equal(c.status, 'tool')
    assert.equal(c.active.length, 1)
    assert.equal(c.active[0].project, 'pi-office')
    assert.equal(c.active[0].tool, 'bash')
    assert.equal(c.active[0].key.length, 10)
    assert.equal(c.stats.messages, 1)
    assert.equal(c.stats.outputTokens, 100)
    assert.equal(c.stats.inputTokens, 15)
    assert.equal(c.stats.toolCalls, 1)
    assert.equal(c.stats.sessions, 1)

    // no content leaks anywhere in the serialized snapshot
    const json = JSON.stringify(snap)
    for (const secret of SECRETS) assert.ok(!json.includes(secret), `leaked: ${secret}`)

    // toolResult -> thinking
    await appendFile(file, toolResult())
    await store.refresh()
    snap = store.snapshot()
    assert.equal(snap.characters[0].status, 'thinking')

    // assistant stop -> idle
    await appendFile(
      file,
      assistant({ stopReason: 'stop', output: 50, start: Date.now() + 1000 }),
    )
    await store.refresh()
    snap = store.snapshot()
    assert.equal(snap.characters[0].status, 'idle')
    assert.equal(snap.characters[0].active.length, 0)
    assert.equal(snap.characters[0].stats.outputTokens, 150)
    assert.equal(snap.totals.activeSessions, 0)
  })
})

test('store: tailing handles a partial trailing line', async () => {
  await withStore(async (dir, store) => {
    const file = join(dir, 'sessions', 'x.jsonl')
    await mkdir(join(dir, 'sessions'), { recursive: true })
    const full = header('sess-partial') + modelChange('openai-codex', 'gpt-6.1-sol') + user()
    await writeFile(file, full + '{"type":"message","timestamp":"2026')
    await store.start()
    assert.equal(store.snapshot().characters.length, 0) // no assistant reply yet

    await appendFile(file, '","message":{"role":"assistant","provider":"openai-codex","model":"gpt-6.1-sol","stopReason":"stop","timestamp":1,"usage":{"input":1,"output":42},"content":[]}}\n')
    await store.refresh()
    const snap = store.snapshot()
    assert.equal(snap.characters.length, 1)
    assert.equal(snap.characters[0].stats.outputTokens, 42)
    assert.equal(snap.characters[0].status, 'idle')
  })
})

test('store: truncation and deletion drop old state', async () => {
  await withStore(async (dir, store) => {
    const file = join(dir, 'sessions', 'y.jsonl')
    await mkdir(join(dir, 'sessions'), { recursive: true })
    await writeFile(file, header('sess-trunc') + modelChange('anthropic', 'claude-opus-5-5') + assistant({ stopReason: 'stop' }))
    await store.start()
    assert.equal(store.snapshot().characters[0].stats.messages, 1)

    // truncate: file rewritten shorter -> state restarts (old reply is gone)
    await truncate(file, 0)
    await writeFile(file, header('sess-trunc') + modelChange('anthropic', 'claude-opus-5-5'))
    await store.refresh()
    assert.equal(store.snapshot().characters.length, 0)

    await appendFile(file, assistant({ stopReason: 'stop', output: 7, start: 1 }))
    await store.refresh()
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 7)

    // deletion
    await rm(file)
    await store.refresh()
    assert.equal(store.snapshot().characters.length, 0)
    assert.equal(store.snapshot().totals.activeSessions, 0)
  })
})

test('store: forked duplicate replies are counted once', async () => {
  await withStore(async (dir, store) => {
    await mkdir(join(dir, 'sessions'), { recursive: true })
    const a = assistant({ stopReason: 'stop', output: 123, start: 1792000000000 })
    await writeFile(join(dir, 'sessions', 'a.jsonl'), header('sess-a') + modelChange('anthropic', 'claude-opus-5-5') + a)
    await writeFile(join(dir, 'sessions', 'b.jsonl'), header('sess-b') + modelChange('anthropic', 'claude-opus-5-5') + a)
    await store.start()
    const c = store.snapshot().characters[0]
    assert.equal(c.stats.messages, 1)
    assert.equal(c.stats.outputTokens, 123)
    assert.equal(c.stats.sessions, 1) // dedupe keeps the first session's id
  })
})

test('startOfLocalDay: local midnight', () => {
  const t = Date.parse('2026-10-18T13:45:00.000Z')
  const day = new Date(startOfLocalDay(t))
  assert.equal(day.getHours(), 0)
  assert.equal(day.getMinutes(), 0)
  assert.equal(day.getSeconds(), 0)
  assert.equal(day.getMilliseconds(), 0)
  assert.ok(startOfLocalDay(t) <= t)
})

test('store: missing sessions directory is not fatal', async () => {
  const dir = join(tmpdir(), 'pi-office-does-not-exist-' + Date.now())
  const store = new OfficeStore(dir)
  try {
    await store.start()
    const snap = store.snapshot()
    assert.deepEqual(snap.characters, [])
    assert.equal(snap.totals.activeSessions, 0)
  } finally {
    store.stop()
  }
})


test('store: atomic replacement (larger file, new inode) is reparsed from the start', async () => {
  await withStore(async (dir, store) => {
    const file = join(dir, 'sessions', 'replace.jsonl')
    await mkdir(join(dir, 'sessions'), { recursive: true })
    const head = header('sess-replace') + modelChange('anthropic', 'claude-opus-5-5')
    await writeFile(file, head + assistant({ stopReason: 'stop', output: 100, start: 1792000000000 }))
    await store.start()
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 100)

    // Replace the whole file via rename (new inode) with a larger log: old bytes must not be re-read as an append.
    const replacement =
      head +
      assistant({ stopReason: 'stop', output: 200, start: 1792000001000 }) +
      assistant({ stopReason: 'stop', output: 300, start: 1792000002000 })
    const temp = join(dir, 'sessions', 'replace.tmp')
    await writeFile(temp, replacement)
    await rename(temp, file)
    await store.refresh()
    const c = store.snapshot().characters[0]
    assert.equal(c.stats.messages, 2)
    assert.equal(c.stats.outputTokens, 500)
  })
})

test('store: same-size rewrite with a newer mtime is reparsed', async () => {
  await withStore(async (dir, store) => {
    const file = join(dir, 'sessions', 'same-size.jsonl')
    await mkdir(join(dir, 'sessions'), { recursive: true })
    const head = header('sess-same') + modelChange('anthropic', 'claude-opus-5-5')
    const before = head + assistant({ stopReason: 'stop', output: 100, start: 1792000000000 })
    const after = head + assistant({ stopReason: 'stop', output: 700, start: 1792000000000 })
    assert.equal(Buffer.byteLength(before), Buffer.byteLength(after))
    await writeFile(file, before)
    await store.start()
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 100)

    await writeFile(file, after)
    const future = new Date(Date.now() + 5_000)
    await utimes(file, future, future)
    await store.refresh()
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 700)
    assert.equal(store.snapshot().characters[0].stats.messages, 1)
  })
})

test('store: truncation inside a partial tail restarts cleanly', async () => {
  await withStore(async (dir, store) => {
    const file = join(dir, 'sessions', 'partial-tail.jsonl')
    await mkdir(join(dir, 'sessions'), { recursive: true })
    const head = header('sess-tail') + modelChange('anthropic', 'claude-opus-5-5')
    const first = assistant({ stopReason: 'stop', output: 100, start: 1792000000000 })
    const prefix = head + first
    const offset = Buffer.byteLength(prefix)
    const partial = '{"type":"message","timestamp":"2026'
    await writeFile(file, prefix + partial)
    await store.start()
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 100)

    // Shrink into the half-written tail (size is still > the old complete-line offset).
    await truncate(file, offset + 5)
    await appendFile(file, '\n' + assistant({ stopReason: 'stop', output: 42, start: 1792000001000 }))
    await store.refresh()
    const c = store.snapshot().characters[0]
    assert.equal(c.stats.messages, 2)
    assert.equal(c.stats.outputTokens, 142)
  })
})
