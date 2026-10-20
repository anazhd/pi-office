// HTTP boundary: hardening headers, Host allowlist, Origin policy, per-client stream caps and static containment.
import test from 'node:test'
import assert from 'node:assert/strict'
import { request, createServer, type IncomingMessage, type OutgoingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { OfficeSnapshot } from '../../shared/office-types.ts'
import { loadConfig } from '../config.ts'
import { SECURITY_HEADERS, cachedSnapshot, createHandler, isEntryPoint } from '../index.ts'
import { SseHub } from '../sse.ts'

const SNAPSHOT: OfficeSnapshot = {
  now: 1,
  characters: [],
  totals: { activeSessions: 0, workingCharacters: 0, todayOutputTokens: 0, lifetimeOutputTokens: 0 },
}

type Reply = { status: number; headers: IncomingMessage['headers']; body: string; res: IncomingMessage; destroy: () => void }

async function serve(env: Record<string, string>, dist?: string) {
  const hub = new SseHub({ maxClients: 64, maxPerClient: Number(env.PI_OFFICE_SSE_PER_CLIENT ?? 8) })
  const handle = createHandler({ config: loadConfig(env), hub, snapshot: () => SNAPSHOT, dist })
  const server = createServer((req, res) => void handle(req, res).catch(() => {}))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return { server, hub, port }
}

async function stop(server: Server, hub: SseHub) {
  hub.closeAll()
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

/** Raw request with full control over Host/Origin. Streams resolve on the first body chunk. */
function get(port: number, path: string, headers: OutgoingHttpHeaders = {}, method = 'GET'): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, agent: false, headers: { host: '127.0.0.1:' + port, ...headers } })
    req.on('error', reject)
    req.on('response', (res) => {
      let body = ''
      res.setEncoding('utf8')
      const done = () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body, res, destroy: () => req.destroy() })
      if (String(res.headers['content-type']).startsWith('text/event-stream') && method === 'GET') {
        res.once('data', (chunk: string) => {
          body += chunk
          done()
        })
        return
      }
      res.on('data', (chunk: string) => (body += chunk))
      res.on('end', done)
    })
    req.end()
  })
}

test('every response carries the hardening headers and no wildcard CORS', async () => {
  const { server, hub, port } = await serve({})
  try {
    for (const path of ['/api/health', '/api/office', '/', '/does-not-exist.js']) {
      const reply = await get(port, path)
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        assert.equal(reply.headers[name.toLowerCase()], value, path + ' ' + name)
      }
      assert.equal(reply.headers['access-control-allow-origin'], undefined, path)
    }
  } finally {
    await stop(server, hub)
  }
})

test('Host allowlist: unknown names get 421 (DNS rebinding), configured public names are served', async () => {
  const { server, hub, port } = await serve({ PI_OFFICE_ALLOWED_HOSTS: 'office.example.com' })
  try {
    assert.equal((await get(port, '/api/office', { host: 'attacker.example' })).status, 421)
    assert.equal((await get(port, '/', { host: 'attacker.example' })).status, 421)
    assert.equal((await get(port, '/api/office', { host: 'bad host' })).status, 400)
    const ok = await get(port, '/api/office', { host: 'office.example.com' })
    assert.equal(ok.status, 200)
    assert.deepEqual(JSON.parse(ok.body), SNAPSHOT)
    assert.equal((await get(port, '/api/office', { host: 'localhost:' + port })).status, 200)
  } finally {
    await stop(server, hub)
  }
})

test('Origin policy: cross-site API reads and streams are refused; allowlisted origins get exact CORS', async () => {
  const { server, hub, port } = await serve({ PI_OFFICE_ALLOWED_ORIGINS: 'https://app.example.com' })
  try {
    const evil = await get(port, '/api/office', { origin: 'https://evil.example' })
    assert.equal(evil.status, 403)
    assert.equal(evil.headers['access-control-allow-origin'], undefined)
    assert.equal((await get(port, '/api/stream', { origin: 'https://evil.example' })).status, 403)
    assert.equal(hub.size, 0, 'a refused origin never holds a stream slot')

    const app = await get(port, '/api/office', { origin: 'https://app.example.com' })
    assert.equal(app.status, 200)
    assert.equal(app.headers['access-control-allow-origin'], 'https://app.example.com')
    assert.match(String(app.headers.vary), /Origin/)

    const same = await get(port, '/api/office', { origin: 'http://127.0.0.1:' + port })
    assert.equal(same.status, 200)
    assert.equal(same.headers['access-control-allow-origin'], undefined, 'same origin needs no CORS')

    const dev = await get(port, '/api/office', { origin: 'http://localhost:8081' })
    assert.equal(dev.headers['access-control-allow-origin'], 'http://localhost:8081')
  } finally {
    await stop(server, hub)
  }
})

test('per-client stream cap uses the trusted proxy header and cannot be dodged by spoofing', async () => {
  const { server, hub, port } = await serve({
    PI_OFFICE_TRUSTED_PROXIES: '127.0.0.1',
    PI_OFFICE_CLIENT_IP_HEADER: 'cf-connecting-ip',
    PI_OFFICE_SSE_PER_CLIENT: '2',
  })
  const open: Reply[] = []
  try {
    const stream = (ip?: string) => get(port, '/api/stream', ip ? { 'cf-connecting-ip': ip } : {})
    open.push(await stream('198.51.100.1'), await stream('198.51.100.1'))
    assert.deepEqual(open.map((r) => r.status), [200, 200])
    const third = await stream('198.51.100.1')
    assert.equal(third.status, 429)
    assert.equal(third.headers['retry-after'], '10')
    const other = await stream('198.51.100.2')
    assert.equal(other.status, 200, 'another client is unaffected')
    open.push(other)
    // A request without the header shares one capped bucket instead of being exempt.
    open.push(await stream(), await stream())
    assert.equal((await stream()).status, 429)
    assert.equal(hub.size, 5)
    open[0].destroy()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const again = await stream('198.51.100.1')
    assert.equal(again.status, 200, 'a closed stream frees its slot')
    open.push(again)
  } finally {
    for (const r of open) r.destroy()
    await stop(server, hub)
  }
})

test('static files: symlinks out of dist/ are never served, in-tree files are', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pi-office-static-sec-'))
  const dist = join(root, 'dist')
  await mkdir(join(dist, 'assets'), { recursive: true })
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>shell</title>')
  await writeFile(join(dist, 'assets', 'app.js'), 'ok()')
  await writeFile(join(root, 'secret.txt'), 'TOP SECRET')
  await mkdir(join(root, 'outside'))
  await writeFile(join(root, 'outside', 'x.txt'), 'TOP SECRET')
  try {
    await symlink(join(root, 'secret.txt'), join(dist, 'leak.txt'))
    await symlink(join(root, 'outside'), join(dist, 'linked'), 'dir')
  } catch (error) {
    await rm(root, { recursive: true, force: true })
    t.skip('symlinks unavailable here (' + (error as NodeJS.ErrnoException).code + ')')
    return
  }
  const { server, hub, port } = await serve({}, dist)
  try {
    assert.equal((await get(port, '/assets/app.js')).body, 'ok()')
    for (const path of ['/leak.txt', '/linked/x.txt', '/%2e%2e/secret.txt', '/..%5csecret.txt']) {
      const reply = await get(port, path)
      assert.ok(reply.status === 404 || reply.status === 400, path + ' -> ' + reply.status)
      assert.ok(!reply.body.includes('TOP SECRET'), path)
    }
    assert.match((await get(port, '/some/route')).body, /shell/, 'SPA fallback still works')
  } finally {
    await stop(server, hub)
    await rm(root, { recursive: true, force: true })
  }
})

test('cachedSnapshot: request floods reuse one snapshot per window', () => {
  let builds = 0
  let now = 1_000
  const snap = cachedSnapshot((t) => ({ ...SNAPSHOT, now: t + builds++ * 0 }), 250, () => now)
  snap()
  snap()
  now += 249
  snap()
  assert.equal(builds, 1)
  now += 1
  assert.equal(snap().now, 1_250)
  assert.equal(builds, 2)
  now -= 10_000 // clock stepped back: rebuild rather than serve a future snapshot forever
  snap()
  assert.equal(builds, 3)
})

test('isEntryPoint: works through a symlinked checkout path', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-office-entry-'))
  const real = join(dir, 'real.mjs')
  await writeFile(real, '')
  try {
    await symlink(real, join(dir, 'link.mjs'))
  } catch {
    await rm(dir, { recursive: true, force: true })
    t.skip('symlinks unavailable here')
    return
  }
  try {
    const url = pathToFileURL(real).href
    assert.equal(isEntryPoint(url, real), true)
    assert.equal(isEntryPoint(url, join(dir, 'link.mjs')), true)
    assert.equal(isEntryPoint(url, join(dir, 'other.mjs')), false)
    assert.equal(isEntryPoint(url, undefined), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
