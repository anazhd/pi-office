import test from 'node:test'
import assert from 'node:assert/strict'
import { watchStream } from '../../src/hooks/stream-watchdog.ts'

test('silent zombie stream recovers in 45s; heartbeats, resume, online and cleanup', t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 })
  const doc = Object.assign(new EventTarget(), { hidden: false })
  const win = new EventTarget()
  let reconnects = 0
  const watchdog = watchStream(() => reconnects++, doc, win)
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(25_000)
    watchdog.touch()
  }
  assert.equal(reconnects, 0, 'healthy idle stream does not reconnect')
  t.mock.timers.tick(45_000)
  assert.equal(reconnects, 1, 'no onerror needed to recover')
  doc.hidden = true
  t.mock.timers.tick(60_000)
  assert.equal(reconnects, 1)
  doc.hidden = false
  doc.dispatchEvent(new Event('visibilitychange'))
  win.dispatchEvent(new Event('online'))
  win.dispatchEvent(new Event('focus'))
  assert.equal(reconnects, 4)
  watchdog.stop()
  t.mock.timers.tick(60_000)
  win.dispatchEvent(new Event('online'))
  assert.equal(reconnects, 4)
})
