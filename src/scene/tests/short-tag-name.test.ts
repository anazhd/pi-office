import test from 'node:test'
import assert from 'node:assert/strict'
import { shortTagName } from '../short-tag-name.ts'

const names = [
  ['GPT-6 Astra', '6 Astra'], ['GPT-6.1 Sol', '6.1 Sol'], ['GPT-6 Luna', '6 Luna'],
  ['GPT-6', '6'], ['GPT-5.3 Codex', '5.3 Codex'],
  ['Gemini 3.8 Flash', 'Gemini 3.8 Flash'], ['Gemini 3 8 Flash', 'Gemini 3.8 Flash'],
  ['Gemini 3.1 Pro', 'Gemini 3.1 Pro'], ['Gemini 3.1 Flash', 'Gemini 3.1 Flash'],
  ['Claude Sonnet 5.5', 'Sonnet 5.5'], ['Claude Opus 5.5', 'Opus 5.5'],
  ['Claude Haiku 5.5', 'Haiku 5.5'], ['Claude Sonnet 4.6', 'Sonnet 4.6'],
  ['Opus 5.5', 'Opus 5.5'], ['Haiku 4.5', 'Haiku 4.5'],
  ['DeepSeek V4.1 Flash', 'DS V4.1 Flash'], ['DeepSeek V4.1 Flash 1017', 'DS V4.1 Flash'],
  ['DeepSeek R1', 'DS R1'], ['Grok 5', 'Grok 5'], ['Mistral Large 3', 'Mistral Large 3'],
  ['Llama 5 70B', 'Llama 5 70B'], ['Qwen3.5 Coder', 'Qwen3.5 Coder'],
]
const char = (displayName: string, model = displayName, provider = 'test') => ({
  id: `${provider}/${model}`, provider, model, displayName,
})
for (const [full, expected] of names) test(`${full} → ${expected}`, () => {
  assert.equal(shortTagName(char(full)), expected)
})
test('model id fallback never collapses a family to a bare vendor', () => {
  assert.equal(shortTagName(char('Claude', 'claude-sonnet-5-5')), 'Sonnet 5.5')
  assert.equal(shortTagName(char('', 'gpt-6.1-sol')), '6.1 Sol')
})
test('build suffix is retained only when needed; aliases and providers stay distinct', () => {
  const roster = [char('DeepSeek V4.1 Flash', 'deepseek-flash', 'deepseek'),
    char('DeepSeek V4.1 Flash 1017', 'deepseek-v4.1-flash-1017', 'openrouter')]
  assert.equal(shortTagName(roster[1], roster), 'DS V4.1 Flash · 1017')
  assert.equal(new Set(roster.map(c => shortTagName(c, roster))).size, 2)
  const aliases = [char('Gemini 3 8 Flash', 'gemini-3-8-flash'), char('Gemini 3.8 Flash', 'gemini-3.8-flash')]
  assert.equal(new Set(aliases.map(c => shortTagName(c, aliases))).size, 2)
})
