// Read-only smoke against an already-running web server; never starts/restarts production.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
// Run agent-browser's JS launcher with this Node (no shell, works where the npm bin is a Windows .cmd shim);
// fall back to an agent-browser on PATH when the dev dependency is not installed.
const localLauncher = fileURLToPath(new URL('../node_modules/agent-browser/bin/agent-browser.js', import.meta.url))
const agentBrowser = existsSync(localLauncher) ? [process.execPath, [localLauncher]] : ['agent-browser', []]
const runAgentBrowser = (args, options) => exec(agentBrowser[0], [...agentBrowser[1], ...args], options)
// Chrome allows six HTTP/1.1 connections per host and this app keeps one open for its SSE stream,
// so the seventh *distinct* navigation inside one browser session stalls in Page.navigate. The smoke
// test therefore uses one browser session per group of previews (well under six navigations each)
// and closes every session it opened.
const sessionBase = `office-smoke-${process.pid}`
const sessions = []
let session = ''
function useSession(name) {
  session = `${sessionBase}-${name}`
  sessions.push(session)
}
const url = process.env.OFFICE_BROWSER_URL || 'http://127.0.0.1:6702/'
const SEASONS = ['winter', 'spring', 'summer', 'autumn']
// The festive overlay is independent of the season: it can be shown out of season and hidden in
// season. Only explicit previews are asserted; the default calendar result is never asserted.
const FESTIVE_PREVIEWS = [
  { params: { season: 'winter', festive: 'halloween' }, shows: ['season-winter', 'festive-halloween'], hides: [] },
  { params: { season: 'summer', festive: 'none' }, shows: ['season-summer'], hides: ['festive-halloween'] },
  { params: { season: 'autumn', festive: 'halloween' }, shows: ['season-autumn', 'festive-halloween'], hides: [] },
]
async function browser(...args) {
  const { stdout } = await runAgentBrowser(['--session', session, '--json', ...args], {
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  const response = JSON.parse(stdout)
  assert.equal(response.success, true, response.error)
  return response.data
}
function seasonUrl(season) {
  return previewUrl({ season })
}
function previewUrl(params) {
  const target = new URL(url)
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value)
  return target.toString()
}
/** How many elements carry this id (0 or 1; duplicate ids would report 2). */
async function idCount(id) {
  const data = await browser('eval', 'document.querySelectorAll(' + JSON.stringify('#' + id) + ').length')
  return Number(data.result)
}
try {
  useSession('seasons')
  await browser('open', url)
  // This app uses SSE: do not wait for networkidle.
  await browser('wait', '--fn',
    "document.querySelector('svg') !== null && /office/i.test(document.body.innerText)")
  assert.deepEqual((await browser('errors')).errors, [])
  // A successful export can still contain unprocessed CSS or lose utilities to RN Web defaults.
  const styling = (await browser('eval', `(() => {
    const title = document.querySelector('.font-display.text-cream')
    if (!title) return null
    const style = getComputedStyle(title)
    return { color: style.color, font: style.fontFamily }
  })()`)).result
  assert.ok(styling, 'custom theme element is rendered')
  assert.equal(styling.color, 'rgb(244, 237, 224)', 'Tailwind cream token reaches rendered text')
  assert.match(styling.font, /Fraunces_600SemiBold/, 'custom display font utility is applied')

  // Each season is reachable from the URL and paints its own weather layer (no page errors).
  for (const season of SEASONS) {
    await browser('open', seasonUrl(season))
    await browser('wait', '--fn',
      `document.getElementById('season-${season}') !== null`)
    assert.deepEqual((await browser('errors')).errors, [], `${season} rendered with no page errors`)
  }

  // The dated festive overlay layers on top of the season and can be previewed either way.
  await browser('close')
  useSession('festive')
  for (const { params, shows, hides } of FESTIVE_PREVIEWS) {
    const label = Object.entries(params).map(([key, value]) => `${key}=${value}`).join('&')
    await browser('open', previewUrl(params))
    await browser('wait', '--fn', `document.getElementById(${JSON.stringify(shows[0])}) !== null`)
    for (const id of shows) assert.equal(await idCount(id), 1, `${label}: #${id} is present exactly once`)
    for (const id of hides) assert.equal(await idCount(id), 0, `${label}: #${id} is absent`)
    assert.deepEqual((await browser('errors')).errors, [], `${label} rendered with no page errors`)
  }

  console.log(`agent-browser smoke passed: office rendered without page errors (${new URL(url).origin}).`)
  console.log(`Seasons verified through ?season=: ${SEASONS.join(', ')}.`)
  console.log(`Festive overlay verified through ?festive=: ${FESTIVE_PREVIEWS.map((p) => Object.entries(p.params).map(([k, v]) => `${k}=${v}`).join('&')).join(', ')}.`)
} finally {
  for (const name of sessions) {
    await runAgentBrowser(['--session', name, '--json', 'close']).catch(() => {})
  }
}
