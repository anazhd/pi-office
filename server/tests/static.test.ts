import test from 'node:test'
import assert from 'node:assert/strict'
import { cacheControl, safePath } from '../index.ts'

test('safePath: resolves inside dist/', () => {
  const p = safePath('/assets/app.js')
  assert.ok(p)
  assert.match(p!, /\/dist\/assets\/app\.js$/)
  assert.equal(safePath('/'), safePath('/'))
})

test('safePath: rejects traversal and malformed paths', () => {
  assert.equal(safePath('/../package.json'), null)
  assert.equal(safePath('/../../etc/passwd'), null)
  assert.equal(safePath('/%2e%2e/package.json'), null)
  assert.equal(safePath('/a/%2e%2e/%2e%2e/secret'), null)
  assert.equal(safePath('/bad%00name'), null)
  assert.equal(safePath('/%E0%A4%A'), null) // malformed percent-encoding
})

test('cacheControl: immutable for expo static, no-cache otherwise', () => {
  assert.equal(cacheControl('/_expo/static/js/web/index-abc.js'), 'public, max-age=31536000, immutable')
  assert.equal(cacheControl('/index.html'), 'no-cache')
  assert.equal(cacheControl('/'), 'no-cache')
  assert.equal(cacheControl('/assets/logo.png'), 'no-cache')
})

test('sendFile: HEAD uses stat, GET streams the same bytes', async () => {
  const { mkdtemp, writeFile, stat, rm } = await import('node:fs/promises')
  const { createServer } = await import('node:http')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { sendFile } = await import('../index.ts')

  const dir = await mkdtemp(join(tmpdir(), 'pi-office-static-'))
  const file = join(dir, 'asset.js')
  const content = 'console.log("hello pi office")\n'.repeat(1000)
  await writeFile(file, content)
  const info = await stat(file)
  const server = createServer((req, res) => {
    void sendFile(req, res, file, info, '/_expo/static/js/asset.js')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const base = `http://127.0.0.1:${port}/_expo/static/js/asset.js`
  try {
    const head = await fetch(base, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(head.headers.get('content-length'), String(info.size))
    assert.equal(head.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.equal(await head.text(), '')

    const get = await fetch(base)
    assert.equal(get.status, 200)
    assert.equal(get.headers.get('content-length'), String(info.size))
    assert.equal(await get.text(), content)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
})
