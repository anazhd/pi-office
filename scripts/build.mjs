// Cross-platform Expo export. Production never inherits development preview/API overrides.
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function buildEnv(env = process.env, mock = false) {
  const result = { ...env }
  const excluded = new Set(['EXPO_PUBLIC_OFFICE_MOCK', 'EXPO_PUBLIC_OFFICE_SEASON', 'EXPO_PUBLIC_OFFICE_FESTIVE', 'EXPO_PUBLIC_OFFICE_API', 'EXPO_NO_DOTENV'])
  // Windows environment keys are case-insensitive, even when supplied as a plain JS object to spawn.
  for (const key of Object.keys(result)) {
    if (excluded.has(key.toUpperCase())) delete result[key]
  }
  // Otherwise Expo would reload cleared values from .env files after this sanitization.
  result.EXPO_NO_DOTENV = '1'
  if (mock) {
    result.EXPO_PUBLIC_OFFICE_MOCK = '1'
    for (const key of ['EXPO_PUBLIC_OFFICE_SEASON', 'EXPO_PUBLIC_OFFICE_FESTIVE']) {
      if (env[key]) result[key] = env[key]
    }
  }
  return result
}

export function main(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== '--mock')) {
    console.error('Usage: node scripts/build.mjs [--mock]')
    return 1
  }
  const root = fileURLToPath(new URL('..', import.meta.url))
  // Run the JS CLI with this Node executable; no shell, .cmd shim, or platform env syntax.
  const cli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url))
  const result = spawnSync(process.execPath, [cli, 'export', '-p', 'web'], {
    cwd: root,
    env: buildEnv(process.env, args.includes('--mock')),
    stdio: 'inherit',
  })
  if (result.error) console.error(result.error.message)
  return result.status ?? 1
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  process.exitCode = main()
}
