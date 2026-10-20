import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

test('patched selector parser remains compatible with Tailwind nested selectors', async () => {
  const postcss = require('postcss')
  const nested = require('postcss-nested')
  const result = await postcss([nested]).process('.card { &:hover { color: red } }', { from: undefined })
  assert.match(result.css, /\.card:hover/)
  assert.match(result.css, /color: red/)
})

test('xcode UUID override retains the CommonJS v4 API', () => {
  const project = require('xcode').project('not-read.pbxproj')
  project.hash = { project: { objects: {} } }
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/)
})
