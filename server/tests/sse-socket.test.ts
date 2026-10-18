// Real-socket SSE tests: eviction must destroy the TCP socket (not just leave the hub), and HEAD must not subscribe.
import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { request, createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { connect, type AddressInfo, type Socket } from 'node:net'
import type { OfficeSnapshot } from '../../shared/office-types.ts'
import { SseHub } from '../sse.ts'
import { handle, hub as appHub } from '../index.ts'

type Character = OfficeSnapshot['characters'][number]

function character(displayName: string): Character {
  return {
    id: 'anthropic/claude',
    provider: 'anthropic',
    model: 'claude',
    displayName,
    stats: {
      messages: 1,
      outputTokens: 0,
      inputTokens: 0,
      toolCalls: 0,
      sessions: 1,
      todayOutputTokens: 0,
      firstSeen: 1,
      lastSeen: 1,
    },
    level: 1,
    title: 'Intern',
    xp: 0,
    levelProgress: 0,
    status: 'idle',
    active: [],
  }
}

/** A snapshot whose hash changes with `tag` and whose frame is roughly `bytes` long. */
function snapshot(now: number, tag = '', bytes = 0): OfficeSnapshot {
  return {
    now,
    characters: tag || bytes ? [character(`${tag}:${'x'.repeat(bytes)}`)] : [],
    totals: { activeSessions: 0, workingCharacters: 0, todayOutputTokens: 0, lifetimeOutputTokens: 0 },
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

async function stop(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

/** A hub behind a plain http server on an ephemeral port; keeps the server-side req/res for inspection. */
async function startHubServer(hub: SseHub) {
  const served: { req: IncomingMessage; res: ServerResponse }[] = []
  const server = createServer((req, res) => {
    if (req.url !== '/api/stream') {
      res.writeHead(404)
      res.end()
      return
    }
    served.push({ req, res })
    if (!hub.add(req, res, snapshot(1))) res.end()
  })
  const port = await listen(server)
  return { server, port, served }
}

/** Raw TCP client: sends GET /api/stream, then pauses so it never reads (the non-reading peer). */
function connectPaused(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const sock = connect(port, '127.0.0.1', () => {
      sock.write('GET /api/stream HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept: text/event-stream\r\n\r\n')
      sock.pause()
      resolve(sock)
    })
    sock.on('error', reject)
  })
}

async function closed(socket: Socket): Promise<void> {
  if (!socket.closed) await once(socket, 'close')
}

test('sse socket: buffer-cap eviction destroys the real socket and frees the hub slot', async () => {
  const hub = new SseHub({ maxBufferedBytes: 256 * 1024, drainTimeoutMs: 60_000 })
  const { server, port, served } = await startHubServer(hub)
  const client = await connectPaused(port)
  try {
    await waitFor(() => hub.size === 1)
    const { req, res } = served[0]!
    const socket = req.socket

    // The paused peer stops reading; once the kernel buffers fill, bytes queue in user space and trip the cap.
    for (let i = 1; hub.size > 0 && i <= 200; i++) hub.broadcast(snapshot(i, `frame${i}`, 1 << 20))

    assert.equal(hub.size, 0, 'evicted client must leave the hub')
    assert.equal(res.destroyed, true, 'response must be destroyed, not merely ended')
    assert.equal(socket.destroyed, true, 'TCP socket must be destroyed to release its buffer')
    assert.equal(socket.writableLength, 0, 'queued bytes must be dropped')
    await closed(socket)
    assert.equal(socket.closed, true)
  } finally {
    client.destroy()
    await stop(server)
  }
})

test('sse socket: drain-timeout eviction destroys the real socket', async () => {
  // Cap disabled so only the drain timer can evict. A 32MB frame exceeds the kernel socket buffers,
  // so the paused peer never drains and the timer must fire.
  const hub = new SseHub({ maxBufferedBytes: Number.MAX_SAFE_INTEGER, drainTimeoutMs: 50 })
  const { server, port, served } = await startHubServer(hub)
  const client = await connectPaused(port)
  try {
    await waitFor(() => hub.size === 1)
    const socket = served[0]!.req.socket
    hub.broadcast(snapshot(2, 'big', 32 * 1024 * 1024))
    assert.equal(hub.size, 1, 'not evicted synchronously; the drain timer owns it')

    await waitFor(() => hub.size === 0, 2_000)
    assert.equal(served[0]!.res.destroyed, true)
    assert.equal(socket.destroyed, true)
    await closed(socket)
  } finally {
    client.destroy()
    await stop(server)
  }
})

test('sse socket: a reading client stays subscribed; its disconnect releases the hub', async () => {
  const hub = new SseHub({ heartbeatMs: 60_000 })
  const { server, port, served } = await startHubServer(hub)
  const client = await connect(port, '127.0.0.1')
  client.on('error', () => {})
  client.write('GET /api/stream HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n')
  try {
    await waitFor(() => hub.size === 1)
    // Nothing should evict an idle, reading client (guards against request 'close' firing early).
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(hub.size, 1)
    assert.equal(served[0]!.req.socket.destroyed, false)

    client.destroy()
    await waitFor(() => hub.size === 0)
    assert.equal(served[0]!.res.destroyed, true)
  } finally {
    client.destroy()
    await stop(server)
  }
})

test('sse socket: shutdown closeAll destroys every stream socket', async () => {
  const hub = new SseHub({ heartbeatMs: 60_000 })
  const { server, port, served } = await startHubServer(hub)
  const a = await connectPaused(port)
  const b = await connectPaused(port)
  try {
    await waitFor(() => hub.size === 2)
    const sockets = served.map((s) => s.req.socket)
    hub.closeAll()
    assert.equal(hub.size, 0)
    for (const socket of sockets) {
      assert.equal(socket.destroyed, true)
      await closed(socket)
    }
  } finally {
    a.destroy()
    b.destroy()
    await stop(server)
  }
})

test('sse socket: HEAD /api/stream answers SSE headers and ends without subscribing', async () => {
  const server = createServer((req, res) => void handle(req, res).catch(() => {}))
  const port = await listen(server)
  try {
    const result = await new Promise<{ status?: number; headers: IncomingMessage['headers']; body: string }>(
      (resolve, reject) => {
        const req = request(
          { host: '127.0.0.1', port, path: '/api/stream', method: 'HEAD', agent: false },
          (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk: string) => (body += chunk))
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
          },
        )
        req.on('error', reject)
        req.end()
      },
    )
    assert.equal(result.status, 200)
    assert.match(String(result.headers['content-type']), /^text\/event-stream/)
    assert.equal(result.headers['cache-control'], 'no-cache')
    assert.equal(result.headers['x-accel-buffering'], 'no')
    assert.equal(result.headers['access-control-allow-origin'], '*')
    assert.equal(result.body, '')
    assert.equal(appHub.size, 0, 'HEAD must not take a stream slot')
  } finally {
    await stop(server)
  }
})

test('sse socket: GET /api/stream via the app route sends one snapshot, then cleans up on disconnect', async () => {
  const server = createServer((req, res) => void handle(req, res).catch(() => {}))
  const port = await listen(server)
  try {
    const req = request({ host: '127.0.0.1', port, path: '/api/stream', agent: false })
    const res = await new Promise<IncomingMessage>((resolve, reject) => {
      req.on('response', resolve)
      req.on('error', reject)
      req.end()
    })
    assert.equal(res.statusCode, 200)
    const text = await new Promise<string>((resolve) => {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        buf += chunk
        if (buf.includes('event: snapshot')) resolve(buf)
      })
    })
    assert.match(text, /event: snapshot\ndata: \{/)
    assert.equal(appHub.size, 1)

    req.destroy()
    await waitFor(() => appHub.size === 0)
  } finally {
    await stop(server)
  }
})
