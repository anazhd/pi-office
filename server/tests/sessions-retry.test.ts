// Retry behaviour of the session scanner when stat/open/read fail. Real temp files; faults are injected through
// the SessionFileSystem parameter, so no chmod tricks and no ~/.pi access.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, appendFile, truncate, rename, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OfficeStore, nodeSessionFileSystem, type SessionFileSystem } from '../sessions.ts'

type Op = 'stat' | 'open' | 'read'

const line = (o: unknown) => JSON.stringify(o) + '\n'
const T0 = Date.parse('2026-10-18T10:00:10.000Z')

const header = (id: string) =>
  line({ type: 'session', id, timestamp: '2026-10-18T10:00:00.000Z', cwd: '/root/github/pi-office' })
const modelChange = () =>
  line({ type: 'model_change', timestamp: '2026-10-18T10:00:01.000Z', provider: 'anthropic', modelId: 'claude-opus-5-5' })
const user = () =>
  line({
    type: 'message',
    timestamp: '2026-10-18T10:00:05.000Z',
    message: { role: 'user', timestamp: T0, content: [{ type: 'text', text: 'hello' }] },
  })
/** A finished assistant reply; `start` is its identity (with `output`), so distinct replies never dedupe. */
const reply = (output: number, start: number) =>
  line({
    type: 'message',
    timestamp: new Date(start).toISOString(),
    message: {
      role: 'assistant',
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      stopReason: 'stop',
      timestamp: start,
      usage: { input: 10, output, cacheRead: 0, cacheWrite: 0 },
      content: [],
    },
  })

/**
 * A real filesystem with scripted failures. `fail(op, code, skip)` makes the next `op` call throw after `skip`
 * successful calls of that kind; each scripted failure fires once.
 */
function flakyFs() {
  const faults: { op: Op; code: string; skip: number }[] = []
  const check = (op: Op) => {
    const i = faults.findIndex((f) => f.op === op)
    if (i < 0) return
    const f = faults[i]
    if (f.skip > 0) {
      f.skip--
      return
    }
    faults.splice(i, 1)
    throw Object.assign(new Error(`${op} failed: ${f.code}`), { code: f.code })
  }
  const fs: SessionFileSystem = {
    stat: async (path) => {
      check('stat')
      return nodeSessionFileSystem.stat(path)
    },
    open: async (path) => {
      check('open')
      const handle = await nodeSessionFileSystem.open(path)
      return {
        read: async (buffer, offset, length, position) => {
          check('read')
          return handle.read(buffer, offset, length, position)
        },
        close: () => handle.close(),
      }
    },
  }
  return {
    fs,
    fail: (op: Op, code = 'EACCES', skip = 0) => faults.push({ op, code, skip }),
    pending: () => faults.length,
  }
}

async function withFlakyStore(fn: (dir: string, store: OfficeStore, io: ReturnType<typeof flakyFs>) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'pi-office-retry-'))
  const io = flakyFs()
  const store = new OfficeStore(dir, io.fs)
  try {
    await fn(dir, store, io)
  } finally {
    store.stop()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Start the store, then stop its watcher and timers so only explicit refresh() calls scan (deterministic faults). */
async function startQuiet(store: OfficeStore) {
  await store.start()
  store.stop()
}

async function sessionFile(dir: string, name: string, content: string): Promise<string> {
  await mkdir(join(dir, 'sessions'), { recursive: true })
  const file = join(dir, 'sessions', name)
  await writeFile(file, content)
  return file
}

// (a) A failed read is retried on the next pass without the file changing.

for (const op of ['stat', 'open', 'read'] as const) {
  test(`retry: a failed ${op} on the first scan is retried without the file changing`, async () => {
    await withFlakyStore(async (dir, store, io) => {
      await sessionFile(dir, 'first-scan.jsonl', header('sess-first') + modelChange() + reply(100, T0))
      io.fail(op)
      await startQuiet(store)
      assert.equal(io.pending(), 0, 'the injected failure fired')
      assert.equal(store.snapshot().characters.length, 0, 'nothing could be read yet')

      await store.refresh() // same bytes, same metadata
      const c = store.snapshot().characters[0]
      assert.ok(c, 'the session appears on the retry')
      assert.equal(c.stats.messages, 1)
      assert.equal(c.stats.outputTokens, 100)
      assert.equal(c.stats.inputTokens, 10)
      assert.equal(c.stats.sessions, 1)
    })
  })
}

test('retry: a failed read of an appended tail is picked up without another append', async () => {
  await withFlakyStore(async (dir, store, io) => {
    const file = await sessionFile(dir, 'append.jsonl', header('sess-append') + modelChange() + reply(100, T0))
    await startQuiet(store)
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 100)

    await appendFile(file, reply(50, T0 + 1000))
    io.fail('read')
    await store.refresh()
    assert.equal(io.pending(), 0)
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 100, 'failed pass consumed nothing new')

    await store.refresh() // no file change at all since the failed pass
    const c = store.snapshot().characters[0]
    assert.equal(c.stats.messages, 2)
    assert.equal(c.stats.outputTokens, 150)
  })
})

test('retry: a failed read of an appended user line restores the activity status', async () => {
  await withFlakyStore(async (dir, store, io) => {
    const file = await sessionFile(dir, 'status.jsonl', header('sess-status') + modelChange())
    await startQuiet(store)
    assert.equal(store.snapshot().totals.activeSessions, 0)

    await appendFile(file, user())
    io.fail('read')
    await store.refresh()
    assert.equal(store.snapshot().totals.activeSessions, 0, 'the user line is not consumed yet')

    await store.refresh()
    assert.equal(store.snapshot().totals.activeSessions, 1, 'the retry consumes it and the session is working')
  })
})

test('retry: a failed read partway through a multi-chunk file keeps state and offset in step', async () => {
  await withFlakyStore(async (dir, store, io) => {
    // Enough replies to need a second read chunk (the scanner reads 8 MiB at a time).
    const sample = reply(1, T0)
    const count = Math.ceil((8 * 1024 * 1024) / sample.length) + 1000
    let content = header('sess-big') + modelChange()
    for (let i = 0; i < count; i++) content += reply(i + 1, T0 + i * 1000)
    await sessionFile(dir, 'big.jsonl', content)

    io.fail('read', 'EIO', 1) // first chunk succeeds, the second fails
    await startQuiet(store)
    assert.equal(io.pending(), 0)
    const partial = store.snapshot().characters[0]?.stats.messages ?? 0
    assert.ok(partial > 0 && partial < count, `partial pass counted ${partial} of ${count}`)

    await store.refresh() // resumes at the failed chunk: no re-count of the first chunk, nothing skipped
    const c = store.snapshot().characters[0]
    assert.equal(c.stats.messages, count)
    assert.equal(c.stats.outputTokens, (count * (count + 1)) / 2)
  })
})

// (b) A failure during a reset (replace, truncation, in-place rewrite) must not leave stale or double-counted
// totals; the retry is a full reparse.

test('reset retry: failed read after an atomic replacement reparses from byte 0 exactly once', async () => {
  await withFlakyStore(async (dir, store, io) => {
    const head = header('sess-replace') + modelChange()
    const file = await sessionFile(dir, 'replace.jsonl', head + reply(100, T0))
    await startQuiet(store)
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 100)

    // New inode, larger log. The reset subtracts the old reply, then the read fails.
    const temp = join(dir, 'sessions', 'replace.tmp')
    await writeFile(temp, head + reply(200, T0 + 1000) + reply(300, T0 + 2000))
    await rename(temp, file)
    let emits = 0
    const unsubscribe = store.subscribe(() => emits++)
    io.fail('read')
    await store.refresh()
    unsubscribe()
    assert.equal(io.pending(), 0)
    assert.equal(store.snapshot().characters.length, 0, 'old contribution removed, nothing stale left behind')
    assert.ok(emits > 0, 'the removal is published even though the pass failed')

    await store.refresh()
    const c = store.snapshot().characters[0]
    assert.equal(c.stats.messages, 2)
    assert.equal(c.stats.outputTokens, 500)

    await store.refresh() // further passes with no change must not re-add anything
    assert.equal(store.snapshot().characters[0].stats.messages, 2)
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 500)
  })
})

test('reset retry: failed read after truncation reparses from byte 0 exactly once', async () => {
  await withFlakyStore(async (dir, store, io) => {
    const head = header('sess-trunc') + modelChange()
    const file = await sessionFile(dir, 'trunc.jsonl', head + reply(100, T0) + reply(50, T0 + 1000))
    await startQuiet(store)
    assert.equal(store.snapshot().characters[0].stats.messages, 2)

    await truncate(file, 0)
    await writeFile(file, head + reply(7, T0 + 2000))
    io.fail('read')
    await store.refresh()
    assert.equal(io.pending(), 0)
    assert.equal(store.snapshot().characters.length, 0)

    await store.refresh()
    const c = store.snapshot().characters[0]
    assert.equal(c.stats.messages, 1)
    assert.equal(c.stats.outputTokens, 7)
  })
})

test('reset retry: failed open after an in-place rewrite (same size, new mtime) reparses cleanly', async () => {
  await withFlakyStore(async (dir, store, io) => {
    const head = header('sess-same') + modelChange()
    const before = head + reply(100, T0)
    const after = head + reply(700, T0)
    assert.equal(Buffer.byteLength(before), Buffer.byteLength(after))
    const file = await sessionFile(dir, 'same-size.jsonl', before)
    await startQuiet(store)
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 100)

    await writeFile(file, after)
    const future = new Date(Date.now() + 5_000)
    await utimes(file, future, future)
    io.fail('open')
    await store.refresh()
    assert.equal(io.pending(), 0)
    assert.equal(store.snapshot().characters.length, 0)

    await store.refresh()
    const c = store.snapshot().characters[0]
    assert.equal(c.stats.messages, 1)
    assert.equal(c.stats.outputTokens, 700)
  })
})

test('reset retry: a shared (forked) reply keeps its other owner while one copy is reset', async () => {
  await withFlakyStore(async (dir, store, io) => {
    const head = (id: string) => header(id) + modelChange()
    const shared = reply(123, T0)
    await sessionFile(dir, 'a.jsonl', head('sess-a') + shared)
    const b = await sessionFile(dir, 'b.jsonl', head('sess-b') + shared)
    await startQuiet(store)
    let c = store.snapshot().characters[0]
    assert.equal(c.stats.messages, 1)
    assert.equal(c.stats.outputTokens, 123)

    // Drop b's copy (shrink -> reset) and fail its re-read. a still owns the reply, so the total must not change.
    await truncate(b, 0)
    await writeFile(b, head('sess-b'))
    io.fail('read')
    await store.refresh()
    assert.equal(io.pending(), 0)
    c = store.snapshot().characters[0]
    assert.equal(c.stats.messages, 1)
    assert.equal(c.stats.outputTokens, 123)
    assert.equal(c.stats.sessions, 1)

    await store.refresh()
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 123)

    // b gets a different reply: now two distinct replies, each counted once.
    await appendFile(b, reply(5, T0 + 1000))
    await store.refresh()
    c = store.snapshot().characters[0]
    assert.equal(c.stats.messages, 2)
    assert.equal(c.stats.outputTokens, 128)
  })
})

test('retry: default filesystem still scans without injected faults', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-office-default-fs-'))
  const store = new OfficeStore(dir)
  try {
    await sessionFile(dir, 'plain.jsonl', header('sess-plain') + modelChange() + reply(9, T0))
    await store.start()
    assert.equal(store.snapshot().characters[0].stats.outputTokens, 9)
  } finally {
    store.stop()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})
