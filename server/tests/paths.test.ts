// Data/state path rules for every OS, simulated with injected platform/env/home (no real ~/.pi access).
import test from 'node:test'
import assert from 'node:assert/strict'
import { deskStatePath, expandUserPath, isInside, piAgentDir, piSessionsLocation } from '../paths.ts'

const noFile = () => null
const linux = { platform: 'linux' as const, home: '/home/u', exists: () => false, readText: noFile }
const mac = { platform: 'darwin' as const, home: '/Users/u', exists: () => false, readText: noFile }
const win = { platform: 'win32' as const, home: 'C:\\Users\\u', exists: () => false, readText: noFile }

test('sessions dir precedence: office override > Pi session dir > Pi agent dir > ~/.pi/agent/sessions', () => {
  const all = {
    PI_OFFICE_SESSIONS_DIR: '/office/sessions',
    PI_CODING_AGENT_SESSION_DIR: '/pi/session-dir',
    PI_CODING_AGENT_DIR: '/pi/agent',
  }
  assert.deepEqual(piSessionsLocation({ ...linux, env: all }), { dir: '/office/sessions', source: 'PI_OFFICE_SESSIONS_DIR' })
  const { PI_OFFICE_SESSIONS_DIR: _a, ...noOffice } = all
  assert.deepEqual(piSessionsLocation({ ...linux, env: noOffice }), { dir: '/pi/session-dir', source: 'PI_CODING_AGENT_SESSION_DIR' })
  assert.deepEqual(piSessionsLocation({ ...linux, env: { PI_CODING_AGENT_DIR: '/pi/agent' } }), {
    dir: '/pi/agent/sessions',
    source: 'PI_CODING_AGENT_DIR',
  })
  assert.deepEqual(piSessionsLocation({ ...linux, env: {} }), { dir: '/home/u/.pi/agent/sessions', source: 'default' })
  // Empty / whitespace values count as unset, like an unset variable.
  assert.equal(piSessionsLocation({ ...linux, env: { PI_OFFICE_SESSIONS_DIR: '  ', PI_CODING_AGENT_SESSION_DIR: '' } }).source, 'default')
})

test('Pi global settings.json sessionDir is honoured after the env vars, read-only and validated', () => {
  const settings = (text: string) => (path: string) => (path === '/home/u/.pi/agent/settings.json' ? text : null)
  assert.deepEqual(piSessionsLocation({ ...linux, env: {}, readText: settings('{"sessionDir":"~/pi-sessions"}') }), {
    dir: '/home/u/pi-sessions',
    source: 'settings.json',
  })
  assert.equal(
    piSessionsLocation({ ...linux, env: { PI_CODING_AGENT_SESSION_DIR: '/env' }, readText: settings('{"sessionDir":"/s"}') }).dir,
    '/env',
    'env wins over settings, as in Pi',
  )
  for (const text of ['{"sessionDir":"relative/dir"}', '{"sessionDir":42}', 'not json', '{}', 'null']) {
    assert.equal(piSessionsLocation({ ...linux, env: {}, readText: settings(text) }).source, 'default', text)
  }
})

test('models dir follows the same agent-dir rule as the sessions parent (never a raw empty value)', () => {
  assert.equal(piAgentDir({ ...linux, env: {} }), '/home/u/.pi/agent')
  assert.equal(piAgentDir({ ...linux, env: { PI_CODING_AGENT_DIR: '' } }), '/home/u/.pi/agent')
  assert.equal(piAgentDir({ ...linux, env: { PI_CODING_AGENT_DIR: '~/custom-pi' } }), '/home/u/custom-pi')
  // The office-only sessions override does not move the model stores.
  assert.equal(piAgentDir({ ...linux, env: { PI_OFFICE_SESSIONS_DIR: '/elsewhere' } }), '/home/u/.pi/agent')
})

test('user paths expand like Pi: ~, ~/x, Windows ~\\x and shell drive paths, file:// URLs', () => {
  assert.equal(expandUserPath('~', linux), '/home/u')
  assert.equal(expandUserPath('~/pi', linux), '/home/u/pi')
  assert.equal(expandUserPath('~other/pi', linux), '~other/pi')
  assert.equal(expandUserPath('/c/x', linux), '/c/x', 'drive rewriting is Windows-only')
  assert.equal(expandUserPath('~\\pi', win), 'C:\\Users\\u\\pi')
  assert.equal(expandUserPath('~/pi', win), 'C:\\Users\\u\\pi')
  assert.equal(expandUserPath('/c/Users/u/pi', win), 'C:\\Users\\u\\pi')
  assert.equal(expandUserPath('/mnt/d/data', win), 'D:\\data')
  assert.equal(expandUserPath('/cygdrive/e', win), 'E:\\')
  assert.equal(expandUserPath('file:///home/u/pi', linux), '/home/u/pi')
  assert.equal(expandUserPath('file:///C:/pi/sessions', win), 'C:\\pi\\sessions')
  assert.equal(
    piSessionsLocation({ ...win, env: { PI_CODING_AGENT_DIR: '~\\.pi-alt' } }).dir,
    'C:\\Users\\u\\.pi-alt\\sessions',
  )
  assert.equal(piSessionsLocation({ ...win, env: {} }).dir, 'C:\\Users\\u\\.pi\\agent\\sessions')
})

test('desk state: Linux keeps XDG; macOS/Windows use app data unless a legacy file or XDG_STATE_HOME exists', () => {
  assert.equal(deskStatePath({ ...linux, env: {} }), '/home/u/.local/state/pi-office/desks.json')
  assert.equal(deskStatePath({ ...mac, env: {} }), '/Users/u/Library/Application Support/pi-office/desks.json')
  assert.equal(
    deskStatePath({ ...mac, env: {}, exists: (p) => p === '/Users/u/.local/state/pi-office/desks.json' }),
    '/Users/u/.local/state/pi-office/desks.json',
    'an existing legacy file keeps everyone at their desks after an upgrade',
  )
  assert.equal(deskStatePath({ ...mac, env: { XDG_STATE_HOME: '/state' } }), '/state/pi-office/desks.json')
  assert.equal(deskStatePath({ ...win, env: { LOCALAPPDATA: 'D:\\Local' } }), 'D:\\Local\\pi-office\\desks.json')
  assert.equal(deskStatePath({ ...win, env: {} }), 'C:\\Users\\u\\AppData\\Local\\pi-office\\desks.json')
  assert.equal(deskStatePath({ ...win, env: { PI_OFFICE_STATE_FILE: '~\\office.json' } }), 'C:\\Users\\u\\office.json')
  for (const options of [linux, mac, win]) {
    assert.equal(/[\\/]\.pi[\\/]/.test(deskStatePath({ ...options, env: {} })), false, 'never under ~/.pi')
  }
})

test('isInside: exact containment per platform, including Windows drives and ..-prefixed names', () => {
  assert.equal(isInside('/srv/dist', '/srv/dist', 'linux'), true)
  assert.equal(isInside('/srv/dist', '/srv/dist/a/b.js', 'linux'), true)
  assert.equal(isInside('/srv/dist', '/srv/dist/..data', 'linux'), true)
  assert.equal(isInside('/srv/dist', '/srv/dist-other/x', 'linux'), false)
  assert.equal(isInside('/srv/dist', '/srv/x', 'linux'), false)
  assert.equal(isInside('C:\\app\\dist', 'C:\\app\\dist\\index.html', 'win32'), true)
  assert.equal(isInside('C:\\app\\dist', 'D:\\app\\dist\\index.html', 'win32'), false)
  assert.equal(isInside('C:\\app\\dist', 'C:\\app\\secret.txt', 'win32'), false)
})
