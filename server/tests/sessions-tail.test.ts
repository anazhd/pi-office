// Tail efficiency: a growing half-written line is scanned once, never re-read from its start every pass.
import test from 'node:test'
import assert from 'node:assert/strict'
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OfficeStore, nodeSessionFileSystem, type SessionFileSystem } from '../sessions.ts'

const NOW = new Date(2026, 9, 18, 12, 0, 0).getTime()
const line = (o: unknown) => JSON.stringify(o) + '\n'
const header = line({ type: 'session', id: 'tail', timestamp: new Date(NOW).toISOString(), cwd: '/fixture/tail' })
const reply = (output: number, pad = '') =>
  line({
    type: 'message',
    timestamp: new Date(NOW).toISOString(),
    message: {
      role: 'assistant', provider: 'p', model: 'm', stopReason: 'stop', timestamp: NOW - output,
      usage: { input: 1, output }, content: [{ type: 'text', text: pad }],
    },
  })

function countingFs(): { fs: SessionFileSystem; bytes: () => number } {
  let total = 0
  return {
    bytes: () => total,
    fs: {
      stat: (path) => nodeSessionFileSystem.stat(path),
      open: async (path) => {
        const handle = await nodeSessionFileSystem.open(path)
        return {
          read: async (buffer, offset, length, position) => {
            const result = await handle.read(buffer, offset, length, position)
            total += result.bytesRead
            return result
          },
          close: () => handle.close(),
        }
      },
    },
  }
}

async function withFile(fn: (file: string, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'pi-office-tail-'))
  try {
    await fn(join(dir, 's.jsonl'), dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('tail: a partial line that grows over many passes is read about twice in total, not once per pass', async () => {
  await withFile(async (file, dir) => {
    const io = countingFs()
    const store = new OfficeStore(dir, io.fs, undefined, { now: () => NOW, maxChunkBytes: 4096 })
    const full = reply(42, 'x'.repeat(200_000))
    await writeFile(file, header)
    await store.start()
    try {
      const pieces = 50
      const step = Math.ceil(full.length / pieces)
      const before = io.bytes()
      for (let i = 0; i < full.length; i += step) {
        await appendFile(file, full.slice(i, i + step))
        await store.refresh()
      }
      const read = io.bytes() - before
      assert.ok(read <= full.length * 2 + 4096, 'read ' + read + ' bytes for a ' + full.length + '-byte line')
      const c = store.snapshot().characters[0]
      assert.equal(c.stats.outputTokens, 42)
      assert.equal(c.stats.messages, 1)
    } finally {
      store.stop()
    }
  })
})

test('tail: lines over the limit are skipped, including one whose newline lands in a later chunk', async () => {
  await withFile(async (file, dir) => {
    const store = new OfficeStore(dir, undefined, undefined, { now: () => NOW, maxChunkBytes: 1024, maxLineBytes: 4096 })
    // One oversized line whose end arrives in a new chunk/pass (pending + tail > limit, but pending alone is not).
    const big = reply(7, 'y'.repeat(6000))
    await writeFile(file, header + reply(1) + big.slice(0, 3500))
    await store.start()
    try {
      await appendFile(file, big.slice(3500) + reply(2))
      await store.refresh()
      // A second oversized line with no newline for a long time, then normal lines again.
      await appendFile(file, '{"type":"message",' + 'z'.repeat(10_000))
      await store.refresh()
      await appendFile(file, 'z"}\n' + reply(3))
      await store.refresh()
      const c = store.snapshot().characters[0]
      assert.equal(c.stats.messages, 3, 'only the three normal replies count')
      assert.equal(c.stats.outputTokens, 6)
    } finally {
      store.stop()
    }
  })
})

test('tail: a partial line split inside a multi-byte character is decoded once whole', async () => {
  await withFile(async (file, dir) => {
    const store = new OfficeStore(dir, undefined, undefined, { now: () => NOW, maxChunkBytes: 64 })
    const bytes = Buffer.from(reply(5, 'é'.repeat(100) + '🙂'))
    const cut = bytes.indexOf(Buffer.from('🙂')) + 2
    await writeFile(file, Buffer.concat([Buffer.from(header), bytes.subarray(0, cut)]))
    await store.start()
    try {
      assert.equal(store.snapshot().characters.length, 0)
      await appendFile(file, bytes.subarray(cut))
      await store.refresh()
      assert.equal(store.snapshot().characters[0].stats.outputTokens, 5)
    } finally {
      store.stop()
    }
  })
})
