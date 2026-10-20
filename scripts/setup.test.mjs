// Setup CLI plans for every OS, rendered on whatever OS runs the tests (no service manager is touched).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SetupError,
  installPlan,
  installedNodePath,
  serviceNodePath,
  nodeVersionProblem,
  parseLaunchdEnv,
  parseSystemdEnv,
  parseWindowsEnv,
  renderLaunchdPlist,
  renderSystemdUnit,
  renderWindowsRunner,
  serviceEnv,
  systemdQuote,
  uninstallPlan,
} from './setup-lib.mjs'
import { parseArgs } from './setup.mjs'

const linux = { platform: 'linux', home: '/home/u', uid: 1000, node: '/opt/node/bin/node', repo: '/home/u/src/pi office' }
const mac = { platform: 'darwin', home: '/Users/u', uid: 501, node: '/opt/homebrew/bin/node', repo: '/Users/u/pi-office' }
const win = { platform: 'win32', home: 'C:\\Users\\u', uid: 0, node: 'C:\\Program Files\\nodejs\\node.exe', repo: 'C:\\src\\pi-office' }

// The unit that scripts/install-local.sh used to write (unquoted, before this CLI existed).
const LEGACY_UNIT = [
  '[Service]',
  'WorkingDirectory=/home/u/src/pi-office',
  'Environment=HOST=127.0.0.1',
  'Environment=PORT=6702',
  'Environment=PI_OFFICE_ALLOWED_HOSTS=office.example.com',
  'ExecStart=/opt/node/bin/node /home/u/src/pi-office/server/index.ts',
].join('\n')

test('node version gate', () => {
  assert.equal(nodeVersionProblem('24.12.0'), null)
  assert.equal(nodeVersionProblem('v26.1.0'), null)
  assert.match(nodeVersionProblem('22.18.0'), /Node >= 24\.12\.0/)
  assert.match(nodeVersionProblem('24.11.9'), /nodejs\.org/)
})

test('service env: defaults, preserved settings, env and --env precedence, no build-time vars', () => {
  assert.deepEqual(serviceEnv({ platform: 'linux', home: '/h' }), { HOST: '127.0.0.1', PORT: '6702' })
  const env = serviceEnv({
    existing: { PORT: '7000', CUSTOM_FLAG: 'kept', EXPO_PUBLIC_OFFICE_MOCK: '1' },
    env: { PORT: '7100', PI_OFFICE_SESSIONS_DIR: '~/sessions', UNRELATED: 'ignored', EXPO_PUBLIC_OFFICE_SEASON: 'winter' },
    set: { PI_OFFICE_ALLOWED_HOSTS: 'office.example.com' },
    platform: 'linux',
    home: '/h',
  })
  assert.deepEqual(env, {
    CUSTOM_FLAG: 'kept',
    HOST: '127.0.0.1',
    PI_OFFICE_ALLOWED_HOSTS: 'office.example.com',
    PORT: '7000',
  })
  assert.equal(serviceEnv({ existing: { PORT: '7000' }, unset: ['PORT'], platform: 'linux', home: '/h' }).PORT, '6702')
})

test('service env: refuses unsafe or ambiguous values with actionable errors', () => {
  const bad = (args, pattern) => assert.throws(() => serviceEnv({ platform: 'linux', home: '/h', ...args }), (e) => e instanceof SetupError && pattern.test(e.message))
  bad({ set: { HOST: '0.0.0.0' } }, /--allow-remote-bind/)
  assert.equal(serviceEnv({ set: { HOST: '0.0.0.0' }, allowRemoteBind: true, platform: 'linux', home: '/h' }).PI_OFFICE_ALLOW_REMOTE_BIND, '1')
  bad({ set: { PI_OFFICE_SESSIONS_DIR: 'relative/dir' } }, /absolute path/)
  bad({ set: { PI_OFFICE_STATE_FILE: '/x\nExecStartPre=/bin/evil' } }, /control character/)
  bad({ set: { PORT: 'abc' } }, /PORT/)
  bad({ set: { EXPO_PUBLIC_OFFICE_MOCK: '1' } }, /build-time/)
  bad({ set: { 'BAD-NAME': 'x' } }, /invalid variable name/)
  assert.throws(() => serviceEnv({ set: { PI_OFFICE_SESSIONS_DIR: 'C:\\a"b' }, platform: 'win32', home: 'C:\\h' }), /double quote/)
})

test('systemd: quoted paths with spaces/specifiers; legacy and new units round-trip their environment', () => {
  assert.equal(systemdQuote('50% "q" \\x'), '"50%% \\"q\\" \\\\x"')
  assert.equal(systemdQuote('/a/$HOME', { exec: true }), '"/a/$$HOME"')
  const env = { HOST: '127.0.0.1', PORT: '6702', PI_OFFICE_STATE_FILE: '/home/u/state 100%/desks.json' }
  const unit = renderSystemdUnit({ node: '/opt/node/bin/node', repo: '/home/u/src/pi office', env })
  assert.match(unit, /^ExecStart="\/opt\/node\/bin\/node" "\/home\/u\/src\/pi office\/server\/index\.ts"$/m)
  assert.match(unit, /^Environment="PI_OFFICE_STATE_FILE=\/home\/u\/state 100%%\/desks\.json"$/m)
  assert.deepEqual(parseSystemdEnv(unit), env)
  assert.deepEqual(parseSystemdEnv(LEGACY_UNIT), { HOST: '127.0.0.1', PORT: '6702', PI_OFFICE_ALLOWED_HOSTS: 'office.example.com' })
  assert.deepEqual(parseSystemdEnv('Environment="A=1 2" B=3'), { A: '1 2', B: '3' })
})

test('linux plan: upgrading the legacy unit keeps its settings and restarts via systemctl --user', () => {
  const plan = installPlan({ ...linux, env: {}, existingText: LEGACY_UNIT })
  assert.equal(plan.manager, 'systemd')
  assert.equal(plan.files[0].path, '/home/u/.config/systemd/user/pi-office.service')
  assert.match(plan.files[0].content, /Environment="PI_OFFICE_ALLOWED_HOSTS=office\.example\.com"/)
  assert.deepEqual(plan.commands.map((c) => c.argv.join(' ')), [
    'systemctl --user daemon-reload',
    'systemctl --user enable pi-office.service',
    'systemctl --user restart pi-office.service',
  ])
  assert.equal(installPlan({ ...linux, env: { XDG_CONFIG_HOME: '/cfg' } }).files[0].path, '/cfg/systemd/user/pi-office.service')
  for (const f of plan.files) assert.equal(f.path.includes('/.pi/'), false, 'never writes under ~/.pi')
})

test('macOS plan: escaped launchd agent in the gui domain, environment preserved', () => {
  const env = { HOST: '127.0.0.1', PORT: '6702', PI_OFFICE_ALLOWED_ORIGINS: 'https://a.example', NOTE: '<&>"' }
  const plist = renderLaunchdPlist({ node: mac.node, repo: '/Users/u/pi & office', env, logDir: '/Users/u/Library/Logs/pi-office' })
  assert.match(plist, /<string>\/Users\/u\/pi &amp; office\/server\/index\.ts<\/string>/)
  assert.deepEqual(parseLaunchdEnv(plist), env)
  const plan = installPlan({ ...mac, env: {}, existingText: plist })
  assert.equal(plan.files[0].path, '/Users/u/Library/LaunchAgents/local.pi-office.plist')
  assert.equal(parseLaunchdEnv(plan.files[0].content).PI_OFFICE_ALLOWED_ORIGINS, 'https://a.example')
  assert.deepEqual(plan.commands.map((c) => c.argv.join(' ')), [
    'launchctl bootout gui/501/local.pi-office',
    'launchctl bootstrap gui/501 /Users/u/Library/LaunchAgents/local.pi-office.plist',
    'launchctl kickstart -k gui/501/local.pi-office',
  ])
  assert.equal(plan.commands[0].allowFailure, true, 'first install has nothing to boot out')
})

test('Windows plan: Startup-folder launcher, no admin or Task Scheduler, batch-escaped values', () => {
  const runner = renderWindowsRunner({ node: win.node, repo: win.repo, env: { HOST: '127.0.0.1', X: '100% & more' }, logFile: 'C:\\l\\pi.log' })
  assert.match(runner, /^set "X=100%% & more"\r$/m)
  assert.match(runner, /^"C:\\Program Files\\nodejs\\node\.exe" "C:\\src\\pi-office\\server\\index\.ts" >> "C:\\l\\pi\.log" 2>&1\r$/m)
  assert.deepEqual(parseWindowsEnv(runner), { HOST: '127.0.0.1', X: '100% & more' })
  const plan = installPlan({ ...win, env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming', LOCALAPPDATA: 'D:\\Local' }, existingText: runner })
  assert.equal(plan.manager, 'startup-folder')
  assert.deepEqual(plan.files.map((f) => f.path), [
    'D:\\Local\\pi-office\\pi-office-run.cmd',
    'C:\\Users\\u\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\pi-office.cmd',
  ])
  assert.equal(parseWindowsEnv(plan.files[0].content).X, '100% & more', 'preserved')
  assert.equal(plan.commands.some((c) => c.argv.some((a) => /schtasks|runas|powershell/i.test(a))), false)
})

test('unsupported platforms and uninstall plans', () => {
  assert.throws(() => installPlan({ ...linux, platform: 'freebsd', env: {} }), /npm start/)
  assert.deepEqual(uninstallPlan({ ...linux }).remove, ['/home/u/.config/systemd/user/pi-office.service'])
  assert.deepEqual(uninstallPlan({ ...mac }).commands[0].argv, ['launchctl', 'bootout', 'gui/501/local.pi-office'])
  assert.equal(uninstallPlan({ ...win, env: { LOCALAPPDATA: 'D:\\L', APPDATA: 'D:\\R' } }).remove.length, 2)
})

test('CLI arguments', () => {
  assert.deepEqual(parseArgs(['install-service', '--dry-run', '--env', 'A=b=c', '--unset', 'B', '--allow-remote-bind']), {
    command: 'install-service', dryRun: true, set: { A: 'b=c' }, unset: ['B'], allowRemoteBind: true, platform: null,
  })
  assert.throws(() => parseArgs(['install-service', '--platform', 'darwin']), /dry-run/)
  assert.throws(() => parseArgs(['install-service', '--env', 'novalue']), /KEY=VALUE/)
  assert.throws(() => parseArgs(['doctor', '--bogus']), /unknown option/)
})
