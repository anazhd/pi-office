import test from 'node:test'
import assert from 'node:assert/strict'
import { installPlan, installedNodePath, serviceNodePath, serviceEnv, renderLaunchdPlist, renderSystemdUnit, renderWindowsRunner } from './setup-lib.mjs'
import { runCommand } from './setup-run.mjs'

const linux = { platform: 'linux', home: '/home/u', uid: 1000, node: '/opt/node/bin/node', repo: '/home/u/repo' }

test('upgrades ignore ambient data/port changes; only explicit flags change installed settings', () => {
  const env = serviceEnv({
    ...linux, existing: { HOST: '127.0.0.1', PORT: '6702' },
    env: { PORT: '3000', XDG_STATE_HOME: '/unexpected', PI_CODING_AGENT_DIR: '/wrong' },
  })
  assert.deepEqual(env, { HOST: '127.0.0.1', PORT: '6702' })
  assert.equal(serviceEnv({ ...linux, existing: env, set: { PORT: '7000' } }).PORT, '7000')
  assert.equal(serviceEnv({ ...linux, env: { PI_CODING_AGENT_DIR: '/custom' } }).PI_CODING_AGENT_DIR, '/custom')
})

test('an existing unit with no Environment lines is still an upgrade, not a new install', () => {
  const plan = installPlan({ ...linux, existingText: '[Service]\nExecStart=/usr/bin/node /repo/server/index.ts', env: { PORT: '3000', XDG_STATE_HOME: '/wrong' } })
  assert.equal(plan.env.PORT, '6702')
  assert.equal(plan.env.XDG_STATE_HOME, undefined)
})

test('service paths cannot inject unit/batch lines', () => {
  for (const field of ['home', 'node', 'repo']) {
    assert.throws(() => installPlan({ ...linux, [field]: '/bad\nExecStartPre=/bad' }), /control character/)
  }
  assert.throws(() => installPlan({ ...linux, env: { XDG_CONFIG_HOME: '/bad\npath' } }), /control character/)
  assert.throws(() => installPlan({
    platform: 'win32', home: 'C:\\Users\\u', uid: 0, node: 'C:\\node.exe', repo: 'C:\\bad"path',
  }), /double quote/)
})

test('Windows startup keeps cmd metacharacter paths inside the inner command quotes', () => {
  const plan = installPlan({
    platform: 'win32', home: 'C:\\Users\\A&B (Work)', uid: 0,
    node: 'C:\\Program Files\\nodejs\\node.exe', repo: 'C:\\Dev (Work)\\pi-office', env: {},
  })
  assert.ok(plan.files[1].content.includes('cmd.exe /d /s /c ""C:\\Users\\A^&B ^(Work^)'))
  const command = plan.commands[0]
  assert.deepEqual(command.argv.slice(0, 4), ['cmd.exe', '/d', '/s', '/c'])
  assert.ok(command.argv[4].startsWith('""') && command.argv[4].endsWith('""'))
  assert.equal(command.windowsVerbatimArguments, true)
})

test('launchd bootstrap retries its transient bootout race, bounded and only for exit 5', async () => {
  const plan = installPlan({ ...linux, platform: 'darwin', home: '/Users/u' })
  const bootstrap = plan.commands.find((c) => c.argv[1] === 'bootstrap')
  let calls = 0
  const delays = []
  await runCommand(bootstrap, () => ({ status: ++calls < 3 ? 5 : 0 }), async (ms) => delays.push(ms))
  assert.equal(calls, 3)
  assert.deepEqual(delays, [500, 500])
  calls = 0
  await assert.rejects(runCommand(bootstrap, () => ({ status: ++calls && 2 }), async () => {}), /exit 2/)
  assert.equal(calls, 1)
})

test('service Node selection keeps stable Homebrew links and skips temporary fnm shells', () => {
  const target = '/opt/homebrew/Cellar/node/26.12/bin/node'
  const realpath = (p) => {
    if ([target, '/opt/homebrew/bin/node', '/tmp/fnm_multishells/123/bin/node'].includes(p)) return target
    throw new Error('not found')
  }
  assert.equal(serviceNodePath({
    execPath: target, platform: 'darwin',
    pathEnv: '/tmp/fnm_multishells/123/bin:/opt/homebrew/bin', realpath,
  }), '/opt/homebrew/bin/node')
  const windowsTarget = 'C:\\nvm\\v26.12\\node.exe'
  assert.equal(serviceNodePath({
    execPath: windowsTarget, platform: 'win32', pathEnv: 'C:\\nvm4w\\nodejs',
    realpath: () => windowsTarget,
  }), 'C:\\nvm4w\\nodejs\\node.exe')
})

test('doctor can extract Node paths from all generated service definitions', () => {
  const node = '/opt/node 100%/bin/node'
  assert.equal(installedNodePath('systemd', renderSystemdUnit({ node, repo: '/repo', env: {} })), node)
  assert.equal(installedNodePath('systemd', 'ExecStart=/usr/bin/node /repo/server/index.ts'), '/usr/bin/node')
  assert.equal(installedNodePath('launchd', renderLaunchdPlist({ node, repo: '/repo', env: {}, logDir: '/logs' })), node)
  const winNode = 'C:\\Program Files\\nodejs\\node.exe'
  assert.equal(installedNodePath('startup-folder', renderWindowsRunner({
    node: winNode, repo: 'C:\\repo', env: {}, logFile: 'C:\\logs\\pi.log',
  })), winNode)
})
