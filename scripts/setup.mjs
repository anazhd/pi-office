#!/usr/bin/env node
// Pi Office setup CLI. Portable (Linux, macOS, Windows), per-user, never needs admin and never writes to ~/.pi.
//
//   node scripts/setup.mjs doctor                         check Node, build, data paths, config and service manager
//   node scripts/setup.mjs install-service [--dry-run]    write + (re)start the per-user service for this checkout
//        [--env KEY=VALUE]... [--unset KEY]... [--allow-remote-bind]
//   node scripts/setup.mjs uninstall-service [--dry-run]  stop + remove the service definition (state is kept)
//
// Foreground (every OS, no service): npm start   (= node server/index.ts)
// This file deliberately starts with no TypeScript imports so an old Node gets a clear message, not a stack trace.
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

const MIN = [24, 12, 0]

function tooOld(version) {
  const parts = version.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if (parts[i] !== MIN[i]) return parts[i] < MIN[i]
  }
  return false
}

const USAGE = [
  'Usage: node scripts/setup.mjs <command> [options]',
  '',
  'Commands:',
  '  doctor              Check Node, the web build, Pi data paths, configuration and the service manager',
  '  install-service     Write and (re)start the per-user service (systemd user unit, launchd agent, or a',
  '                      Windows Startup-folder launcher). Existing service settings are preserved.',
  '  uninstall-service   Stop and remove the service definition (desk state and logs are kept)',
  '',
  'Options (install-service):',
  '  --dry-run           Print the files and commands without changing anything',
  '  --env KEY=VALUE     Set a server variable in the service (repeatable); see SECURITY.md / README.md',
  '  --unset KEY         Remove a preserved variable from the service (repeatable)',
  '  --allow-remote-bind Confirm a non-loopback HOST (otherwise refused)',
  '  --platform NAME     Render for linux|darwin|win32 (with --dry-run only; for review)',
  '',
  'Foreground on any OS, no service needed: npm start',
].join('\n')

export function parseArgs(argv) {
  const out = { command: argv[0] ?? 'help', dryRun: false, set: {}, unset: [], allowRemoteBind: false, platform: null }
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(arg + ' needs a value')
      return v
    }
    if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--allow-remote-bind') out.allowRemoteBind = true
    else if (arg === '--env') {
      const pair = value()
      const eq = pair.indexOf('=')
      if (eq <= 0) throw new Error('--env expects KEY=VALUE (got ' + pair + ')')
      out.set[pair.slice(0, eq)] = pair.slice(eq + 1)
    } else if (arg === '--unset') out.unset.push(value())
    else if (arg === '--platform') out.platform = value()
    else throw new Error('unknown option ' + arg)
  }
  if (out.platform && !out.dryRun) throw new Error('--platform is only for --dry-run reviews; the real install always targets this OS')
  if (out.platform && !['linux', 'darwin', 'win32'].includes(out.platform)) throw new Error('--platform must be linux, darwin or win32')
  return out
}

async function main(argv) {
  if (tooOld(process.versions.node)) {
    console.error(
      'Pi Office needs Node >= ' + MIN.join('.') + ' (found ' + process.version + '). Install a current LTS from ' +
        'https://nodejs.org or with your version manager (fnm, nvm, volta, winget, Homebrew), then retry.',
    )
    return 1
  }
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error(error.message + '\n\n' + USAGE)
    return 2
  }
  if (args.command === 'help' || args.command === '--help' || args.command === '-h') {
    console.log(USAGE)
    return 0
  }
  const { run } = await import('./setup-run.mjs')
  return run(args)
}

const entry = process.argv[1]
const real = (p) => {
  try {
    return realpathSync(p)
  } catch {
    return resolve(p)
  }
}
if (entry && real(fileURLToPath(import.meta.url)) === real(resolve(entry))) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (error) => {
      console.error(error?.message ?? String(error))
      process.exitCode = 1
    },
  )
}
