import test from 'node:test'
import assert from 'node:assert/strict'
import { createNameResolver, heuristicName } from '../names.ts'

test('heuristic: claude family', () => {
  assert.equal(heuristicName('claude-opus-5-5'), 'Opus 5.5')
  assert.equal(heuristicName('claude-sonnet-4-5'), 'Sonnet 4.5')
  assert.equal(heuristicName('claude-haiku-4'), 'Haiku 4')
  assert.equal(heuristicName('anthropic/claude-opus-5-5'), 'Opus 5.5')
})

test('heuristic: gpt family', () => {
  assert.equal(heuristicName('gpt-6.1-sol'), 'GPT-6.1 Sol')
  assert.equal(heuristicName('gpt-5.3-codex-spark'), 'GPT-5.3 Codex Spark')
})

test('heuristic: deepseek with vendor + date suffix', () => {
  assert.equal(heuristicName('deepseek-v4.1-flash'), 'DeepSeek V4.1 Flash')
  assert.equal(heuristicName('deepseek/deepseek-v4.1-flash-1017'), 'DeepSeek V4.1 Flash')
  assert.equal(heuristicName('deepseek/deepseek-v4.1-flash-20251001'), 'DeepSeek V4.1 Flash')
})

test('heuristic: generic models are title-cased', () => {
  assert.equal(heuristicName('grok-4'), 'Grok 4')
  assert.equal(heuristicName('gemini-3-pro'), 'Gemini 3 Pro')
  assert.equal(heuristicName('kimi-k2-thinking'), 'Kimi K2 Thinking')
})

test('heuristic: degenerate input still returns something', () => {
  assert.equal(heuristicName(''), '')
  assert.equal(heuristicName('---'), '---')
})

test('resolver: models-store.json shape wins over heuristic', () => {
  const store = {
    'openai-codex': {
      models: [
        { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' },
        { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark' },
      ],
    },
  }
  const name = createNameResolver([store])
  assert.equal(name('openai-codex', 'gpt-6.1-sol'), 'GPT-6.1 Sol')
  assert.equal(name('other-provider', 'gpt-6.1-sol'), 'GPT-6.1 Sol') // bare-id fallback
  assert.equal(name('openai-codex', 'unknown-model-9'), 'Unknown Model 9')
})

test('resolver: models.json shape (providers) works too', () => {
  const models = {
    $schema: 'x',
    providers: {
      openrouter: {
        models: [{ id: 'deepseek/deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash 1017' }],
      },
    },
  }
  const name = createNameResolver([models])
  assert.equal(name('openrouter', 'deepseek/deepseek-v4.1-flash-1017'), 'DeepSeek V4.1 Flash 1017')
  assert.equal(name('openrouter', 'deepseek/deepseek-v4.1-flash'), 'DeepSeek V4.1 Flash')
})

test('resolver: tolerates missing/invalid sources', () => {
  const name = createNameResolver([null, undefined, 42, 'nope', { bad: true }, { p: { models: 'no' } }])
  assert.equal(name('anthropic', 'claude-opus-5-5'), 'Opus 5.5')
})

test('resolver: first source wins, later sources fill gaps', () => {
  const name = createNameResolver([
    { anthropic: { models: [{ id: 'claude-opus-5-5', name: 'Opus Five' }] } },
    { anthropic: { models: [{ id: 'claude-opus-5-5', name: 'SHOULD NOT WIN' }] } },
  ])
  assert.equal(name('anthropic', 'claude-opus-5-5'), 'Opus Five')
})
