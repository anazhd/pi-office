import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)

test('Tailwind 4 compiles custom tokens and opacity utilities', async () => {
  const postcss = require('postcss')
  const tailwind = require('@tailwindcss/postcss')
  const result = await postcss([tailwind()]).process(
    '@import "tailwindcss"; @theme { --color-cream: #F4EDE0; } @source inline("text-cream bg-cream/80");',
    { from: fileURLToPath(new URL('../global.css', import.meta.url)) },
  )
  assert.match(result.css, /\.text-cream/)
  assert.match(result.css, /color-mix/)
  assert.doesNotMatch(result.css, /@source/)
})

test('xcode UUID override retains the CommonJS v4 API', () => {
  const project = require('xcode').project('not-read.pbxproj')
  project.hash = { project: { objects: {} } }
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/)
})
