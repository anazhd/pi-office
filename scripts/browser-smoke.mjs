// Read-only smoke against an already-running web server; never starts/restarts production.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const session = `office-smoke-${process.pid}`
const url = process.env.OFFICE_BROWSER_URL || 'http://127.0.0.1:6702/'
async function browser(...args) {
  const { stdout } = await exec('agent-browser', ['--session', session, '--json', ...args], {
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  const response = JSON.parse(stdout)
  assert.equal(response.success, true, response.error)
  return response.data
}
try {
  await browser('open', url)
  // This app uses SSE: do not wait for networkidle.
  await browser('wait', '--fn',
    "document.querySelector('svg') !== null && /office/i.test(document.body.innerText)")
  assert.deepEqual((await browser('errors')).errors, [])
  console.log(`agent-browser smoke passed: office rendered without page errors (${new URL(url).origin}).`)
} finally {
  await browser('close')
}
