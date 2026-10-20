// Real cmd.exe regression on Windows runners; no services are installed and the tiny child exits itself.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { renderWindowsStartup } from './setup-lib.mjs'

test('Windows cmd executes a Startup launcher under a metacharacter path', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-office-cmd-'))
  const dir = join(root, 'A&B (Work)^!')
  await mkdir(dir)
  const runner = join(dir, 'probe.cmd')
  const startup = join(dir, 'startup.cmd')
  const marker = join(dir, 'marker.txt')
  try {
    await writeFile(runner, '@echo off\r\nsetlocal DisableDelayedExpansion\r\n> "' + marker + '" echo success\r\n')
    await writeFile(startup, renderWindowsStartup({ runner }))
    const result = spawnSync('cmd.exe', ['/d', '/s', '/c', '""' + startup + '""'], {
      windowsVerbatimArguments: true, encoding: 'utf8', timeout: 10_000,
    })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    let contents = ''
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      try { contents = await readFile(marker, 'utf8') } catch { /* tiny detached child is still starting */ }
      if (contents.trim() === 'success') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(contents.trim(), 'success')
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
