import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { OfficeSnapshot } from '../../shared/office-types.ts'
import { SseHub, snapshotHash } from '../sse.ts'

function snapshot(now: number, outputTokens = 0): OfficeSnapshot {
  return {
    now,
    characters: outputTokens
      ? [
          {
            id: 'anthropic/claude',
            provider: 'anthropic',
            model: 'claude',
            displayName: 'Claude',
            stats: {
              messages: 1,
              outputTokens,
              inputTokens: 0,
              toolCalls: 0,
              sessions: 1,
              todayOutputTokens: outputTokens,
              firstSeen: 1,
              lastSeen: now,
            },
            level: 1,
            title: 'Intern',
            xp: outputTokens,
            levelProgress: 0,
            status: 'idle',
            active: [],
          },
        ]
      : [],
    totals: {
      activeSessions: 0,
      workingCharacters: 0,
      todayOutputTokens: outputTokens,
      lifetimeOutputTokens: outputTokens,
    },
  }
}

function fakeReq(): any {
  return new EventEmitter()
}

function fakeRes(writeResult = true): any {
  const res: any = new EventEmitter()
  res.writableLength = 0
  res.written = []
  res.ended = false
  res.destroyed = false
  res.writeHead = () => {}
  res.write = (chunk: string) => {
    res.written.push(String(chunk))
    return writeResult
  }
  res.end = () => {
    res.ended = true
  }
  res.destroy = () => {
    res.destroyed = true
  }
  return res
}

test('snapshot hash ignores the clock', () => {
  assert.equal(snapshotHash(snapshot(1)), snapshotHash(snapshot(999)))
  assert.notEqual(snapshotHash(snapshot(1)), snapshotHash(snapshot(1, 5)))
})

test('sse: idle heartbeat is observable by EventSource and carries a clock', t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1000 })
  const hub = new SseHub()
  const res = fakeRes()
  hub.add(fakeReq(), res, snapshot(1000))
  t.mock.timers.tick(25_000)
  assert.equal(res.written.at(-1), 'event: heartbeat\ndata: 26000\n\n')
  hub.closeAll()
})

test('sse: caps concurrent clients', () => {
  const hub = new SseHub({ maxClients: 1 })
  assert.equal(hub.add(fakeReq(), fakeRes(), snapshot(1)), true)
  assert.equal(hub.add(fakeReq(), fakeRes(), snapshot(1)), false)
  assert.equal(hub.size, 1)
  hub.closeAll()
  assert.equal(hub.size, 0)
})

test('sse: idle ticks (only now changes) are not resent', () => {
  const hub = new SseHub()
  hub.prime(snapshot(1))
  const res = fakeRes()
  hub.add(fakeReq(), res, snapshot(1))
  res.written.length = 0

  hub.broadcast(snapshot(2))
  assert.equal(res.written.length, 0)

  hub.broadcast(snapshot(2, 10))
  assert.equal(res.written.length, 1)
  hub.closeAll()
})

test('sse: drops a client whose write buffer is over the cap', () => {
  const hub = new SseHub({ maxBufferedBytes: 10 })
  const res = fakeRes()
  hub.add(fakeReq(), res, snapshot(1))
  res.writableLength = 11
  hub.broadcast(snapshot(1, 10))
  assert.equal(hub.size, 0)
  assert.equal(res.destroyed, true)
  assert.equal(res.ended, false)
})

test('sse: drops a client that never drains after a false write', async () => {
  const hub = new SseHub({ drainTimeoutMs: 5 })
  const res = fakeRes(false)
  hub.add(fakeReq(), res, snapshot(1))
  assert.equal(hub.size, 1)
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(hub.size, 0)
})

test('sse: request errors clean up the client', () => {
  const hub = new SseHub()
  const req = fakeReq()
  const res = fakeRes()
  hub.add(req, res, snapshot(1))
  assert.equal(hub.size, 1)
  req.emit('error', new Error('boom'))
  assert.equal(hub.size, 0)
  assert.equal(res.destroyed, true)
})

test('sse: cleanup is idempotent across close, error and shutdown', () => {
  const hub = new SseHub()
  const req = fakeReq()
  const res = fakeRes()
  hub.add(req, res, snapshot(1))
  let destroys = 0
  res.destroy = () => {
    destroys++
    res.destroyed = true
  }
  res.emit('close')
  req.emit('error', new Error('late'))
  res.emit('error', new Error('late'))
  hub.closeAll()
  assert.equal(hub.size, 0)
  assert.equal(destroys, 1)
})

test('sse: late response errors after eviction do not throw', () => {
  const hub = new SseHub({ maxBufferedBytes: 10 })
  const res = fakeRes()
  hub.add(fakeReq(), res, snapshot(1))
  res.writableLength = 11
  hub.broadcast(snapshot(1, 10))
  assert.equal(hub.size, 0)
  assert.doesNotThrow(() => res.emit('error', new Error('write after destroy')))
})
