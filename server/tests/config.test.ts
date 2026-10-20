// Request-boundary policy: config validation, Host/Origin checks and spoof-resistant client buckets.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addressBucket,
  checkHost,
  checkOrigin,
  clientBucket,
  ConfigError,
  isLoopbackIp,
  loadConfig,
  normalizeHost,
  normalizeOrigin,
} from '../config.ts'

test('config: secure defaults', () => {
  const c = loadConfig({})
  assert.equal(c.host, '127.0.0.1')
  assert.equal(c.port, 6702)
  assert.deepEqual([...c.allowedHosts], ['localhost', '127.0.0.1', '[::1]'])
  assert.deepEqual(c.publicHosts, [])
  assert.deepEqual([...(c.allowedOrigins as Set<string>)], [])
  assert.equal(c.trustedProxies.size, 0)
  assert.equal(c.sseMaxClients, 64)
  assert.equal(c.ssePerClient, 8)
})

test('config: non-loopback bind is refused unless explicitly allowed', () => {
  assert.throws(() => loadConfig({ HOST: '0.0.0.0' }), ConfigError)
  assert.throws(() => loadConfig({ HOST: '192.168.1.5' }), /PI_OFFICE_ALLOW_REMOTE_BIND/)
  assert.equal(loadConfig({ HOST: '0.0.0.0', PI_OFFICE_ALLOW_REMOTE_BIND: '1' }).host, '0.0.0.0')
  for (const host of ['localhost', '127.0.0.1', '127.0.0.2', '::1']) assert.equal(loadConfig({ HOST: host }).host, host)
})

test('config: invalid values fail loudly with the variable name', () => {
  assert.throws(() => loadConfig({ PORT: '70000' }), /PORT/)
  assert.throws(() => loadConfig({ PORT: '12abc' }), /PORT/)
  assert.throws(() => loadConfig({ PI_OFFICE_ALLOWED_HOSTS: 'https://office.example.com' }), /PI_OFFICE_ALLOWED_HOSTS/)
  assert.throws(() => loadConfig({ PI_OFFICE_ALLOWED_HOSTS: 'office.example.com:443' }), /PI_OFFICE_ALLOWED_HOSTS/)
  assert.throws(() => loadConfig({ PI_OFFICE_ALLOWED_HOSTS: '*.example.com' }), /PI_OFFICE_ALLOWED_HOSTS/)
  assert.throws(() => loadConfig({ PI_OFFICE_ALLOWED_ORIGINS: 'office.example.com' }), /PI_OFFICE_ALLOWED_ORIGINS/)
  assert.throws(() => loadConfig({ PI_OFFICE_ALLOWED_ORIGINS: 'https://a.example/path' }), /PI_OFFICE_ALLOWED_ORIGINS/)
  assert.throws(() => loadConfig({ PI_OFFICE_ALLOWED_ORIGINS: '*,https://a.example' }), /PI_OFFICE_ALLOWED_ORIGINS/)
  assert.throws(() => loadConfig({ PI_OFFICE_TRUSTED_PROXIES: '10.0.0.0/8' }), /PI_OFFICE_TRUSTED_PROXIES/)
  assert.throws(() => loadConfig({ PI_OFFICE_TRUSTED_PROXIES: 'proxy.local' }), /PI_OFFICE_TRUSTED_PROXIES/)
  assert.throws(() => loadConfig({ PI_OFFICE_CLIENT_IP_HEADER: 'x-client-ip' }), /PI_OFFICE_CLIENT_IP_HEADER/)
  assert.throws(() => loadConfig({ PI_OFFICE_SSE_PER_CLIENT: '0' }), /PI_OFFICE_SSE_PER_CLIENT/)
})

test('config: allowlisted public hosts are reported as public', () => {
  const c = loadConfig({ PI_OFFICE_ALLOWED_HOSTS: 'Office.Example.com, localhost, office.example.com.' })
  assert.ok(c.allowedHosts.has('office.example.com'))
  assert.deepEqual(c.publicHosts, ['office.example.com'])
})

test('normalizeHost / normalizeOrigin', () => {
  assert.equal(normalizeHost('Localhost:6702'), 'localhost')
  assert.equal(normalizeHost('[::1]:6702'), '[::1]')
  assert.equal(normalizeHost('office.example.com.'), 'office.example.com')
  for (const bad of ['', 'a b', 'evil.com@good.com', '::1', '[::1', 'host:', 'host:99999', 'host/path', '-bad.com']) {
    assert.equal(normalizeHost(bad), null, bad)
  }
  assert.equal(normalizeOrigin('https://App.Example.com'), 'https://app.example.com')
  assert.equal(normalizeOrigin('http://localhost:8081'), 'http://localhost:8081')
  for (const bad of ['null', 'file:///x', 'https://a.example/x', 'https://u:p@a.example', 'ftp://a.example']) {
    assert.equal(normalizeOrigin(bad), null, bad)
  }
})

test('checkHost: DNS rebinding and malformed Host are refused', () => {
  const c = loadConfig({ PI_OFFICE_ALLOWED_HOSTS: 'office.example.com' })
  assert.deepEqual(checkHost(c, { host: '127.0.0.1:6702' }), { ok: true, host: '127.0.0.1' })
  assert.deepEqual(checkHost(c, { host: 'office.example.com' }), { ok: true, host: 'office.example.com' })
  assert.deepEqual(checkHost(c, { host: 'attacker.example' }), { ok: false, status: 421 })
  assert.deepEqual(checkHost(c, { host: '192.168.1.5:6702' }), { ok: false, status: 421 })
  assert.deepEqual(checkHost(c, {}), { ok: false, status: 400 })
  assert.deepEqual(checkHost(c, { host: 'bad host' }), { ok: false, status: 400 })
})

test('checkOrigin: same origin, loopback dev origins and the allowlist only', () => {
  const c = loadConfig({ PI_OFFICE_ALLOWED_HOSTS: 'office.example.com', PI_OFFICE_ALLOWED_ORIGINS: 'https://app.example.com' })
  assert.deepEqual(checkOrigin(c, { host: 'office.example.com' }), { kind: 'none' })
  assert.deepEqual(checkOrigin(c, { host: 'office.example.com', origin: 'https://office.example.com' }), { kind: 'same' })
  assert.deepEqual(checkOrigin(c, { host: '127.0.0.1:6702', origin: 'http://127.0.0.1:6702' }), { kind: 'same' })
  assert.deepEqual(checkOrigin(c, { host: '127.0.0.1:6702', origin: 'http://localhost:8081' }), {
    kind: 'cors',
    allowOrigin: 'http://localhost:8081',
  })
  assert.deepEqual(checkOrigin(c, { host: 'office.example.com', origin: 'https://app.example.com' }), {
    kind: 'cors',
    allowOrigin: 'https://app.example.com',
  })
  for (const origin of ['https://evil.example', 'null', 'https://office.example.com.evil.example', 'https://localhost:8081']) {
    assert.deepEqual(checkOrigin(c, { host: 'office.example.com', origin }), { kind: 'deny' }, origin)
  }
  const open = loadConfig({ PI_OFFICE_ALLOWED_ORIGINS: '*' })
  assert.deepEqual(checkOrigin(open, { host: '127.0.0.1', origin: 'https://anyone.example' }), { kind: 'cors', allowOrigin: '*' })
})

test('clientBucket: forwarded headers count only from a configured proxy', () => {
  const direct = loadConfig({})
  // Spoofed headers from a direct peer are ignored: the TCP address is the bucket.
  assert.equal(clientBucket(direct, '203.0.113.9', { 'x-forwarded-for': '198.51.100.1' }), '203.0.113.9')
  assert.equal(clientBucket(direct, '::ffff:203.0.113.9', {}), '203.0.113.9')
  // Undeclared loopback peers (local users, or an undeclared tunnel) are exempt from the per-client cap.
  assert.equal(clientBucket(direct, '127.0.0.1', { 'cf-connecting-ip': '198.51.100.1' }), null)
  assert.equal(clientBucket(direct, '::1', {}), null)
  const publicOffice = loadConfig({ PI_OFFICE_ALLOWED_HOSTS: 'office.example.com' })
  assert.equal(clientBucket(publicOffice, '127.0.0.1', { 'cf-connecting-ip': '198.51.100.1' }), '127.0.0.1')
  assert.notEqual(clientBucket(publicOffice, '::1', {}), null, 'undeclared public proxies are capped, not exempt')
  // IPv6 clients are grouped by /64 so rotating the interface id gains nothing.
  assert.equal(clientBucket(direct, '2001:db8:1:2::5', {}), clientBucket(direct, '2001:db8:1:2:ffff::9', {}))
  assert.notEqual(clientBucket(direct, '2001:db8:1:2::5', {}), clientBucket(direct, '2001:db8:1:3::5', {}))

  const cf = loadConfig({ PI_OFFICE_TRUSTED_PROXIES: '127.0.0.1,::1', PI_OFFICE_CLIENT_IP_HEADER: 'cf-connecting-ip' })
  assert.equal(clientBucket(cf, '127.0.0.1', { 'cf-connecting-ip': '198.51.100.1' }), '198.51.100.1')
  assert.equal(clientBucket(cf, '127.0.0.1', {}), 'proxy:unknown')
  assert.equal(clientBucket(cf, '127.0.0.1', { 'cf-connecting-ip': '1.1.1.1, 2.2.2.2' }), 'proxy:unknown')
  assert.equal(clientBucket(cf, '127.0.0.1', { 'cf-connecting-ip': 'garbage' }), 'proxy:unknown')
  // A remote peer cannot borrow the trusted header.
  assert.equal(clientBucket(cf, '203.0.113.9', { 'cf-connecting-ip': '198.51.100.1' }), '203.0.113.9')

  const xff = loadConfig({ PI_OFFICE_TRUSTED_PROXIES: '10.0.0.2' })
  // Rightmost hop not added by our proxy wins; the client-supplied left part is never believed.
  assert.equal(clientBucket(xff, '10.0.0.2', { 'x-forwarded-for': '6.6.6.6, 198.51.100.7' }), '198.51.100.7')
  assert.equal(clientBucket(xff, '10.0.0.2', { 'x-forwarded-for': '198.51.100.7, 10.0.0.2' }), '198.51.100.7')
  assert.equal(clientBucket(xff, '10.0.0.2', { 'x-forwarded-for': 'nonsense' }), 'proxy:unknown')
})

test('loopback / bucket helpers', () => {
  assert.equal(isLoopbackIp('127.8.9.1'), true)
  assert.equal(isLoopbackIp('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackIp('0:0:0:0:0:0:0:1'), true)
  assert.equal(isLoopbackIp('10.0.0.1'), false)
  assert.equal(addressBucket('2001:db8::1'), '2001:db8:0:0::/64')
})
