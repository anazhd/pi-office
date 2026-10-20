import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEnv } from './build.mjs'

const original = {
  PATH: '/example',
  EXPO_PUBLIC_OFFICE_MOCK: '1',
  EXPO_PUBLIC_OFFICE_SEASON: 'winter',
  EXPO_PUBLIC_OFFICE_FESTIVE: 'halloween',
  EXPO_PUBLIC_OFFICE_API: 'https://unexpected.example',
}

test('production build removes all development/public API overrides without mutating caller env', () => {
  assert.deepEqual(buildEnv(original), { PATH: '/example', EXPO_NO_DOTENV: '1' })
  assert.equal(original.EXPO_PUBLIC_OFFICE_MOCK, '1')
})

test('production sanitizes case variants supplied by Windows environments', () => {
  assert.deepEqual(buildEnv({ Path: 'C:\\tools', expo_public_office_mock: '1', Expo_No_Dotenv: '0' }), {
    Path: 'C:\\tools', EXPO_NO_DOTENV: '1',
  })
})

test('mock build explicitly enables fixtures and retains cosmetic previews, not an external API', () => {
  assert.deepEqual(buildEnv(original, true), {
    PATH: '/example',
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_OFFICE_MOCK: '1',
    EXPO_PUBLIC_OFFICE_SEASON: 'winter',
    EXPO_PUBLIC_OFFICE_FESTIVE: 'halloween',
  })
})
