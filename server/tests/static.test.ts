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
