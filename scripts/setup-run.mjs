// I/O half of the setup CLI: turns setup-lib plans into checks, file writes and service-manager commands.
import { spawn, spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MOCK_MARKER,
  SetupError,
  dataLocations,
  installPlan,
  installedNodePath,
  serviceNodePath,
  nodeVersionProblem,
  parseExistingEnv,
  serviceEnv,
  serviceLocations,
  uninstallPlan,
} from './setup-lib.mjs'

const REPO = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const real = (p) => {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

function readOrNull(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** The installed definition whose settings are preserved (Windows keeps them in the runner script). */
function existingDefinition(where) {
  if (!where) return null
  return readOrNull(where.runner ?? where.file)
}

/** Null when dist/ is a production build; otherwise an actionable problem. */
export function buildProblem(repo = REPO) {
  const dist = join(repo, 'dist')
  if (!existsSync(join(dist, 'index.html'))) return 'The web app is not built: run "npm run build" in ' + repo
  const stack = [join(dist, '_expo')]
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.name.endsWith('.js') && readFileSync(p, 'utf8').includes(MOCK_MARKER)) {
        return 'dist/ contains the mock fixture (' + MOCK_MARKER + '): rebuild with "npm run build" (not build:mock)'
      }
    }
  }
  return null
}

function systemdUserAvailable() {
  const r = spawnSync('systemctl', ['--user', 'show-environment'], { stdio: 'ignore' })
  if (r.error) return 'systemctl not found'
  return r.status === 0 ? null : 'no systemd user session (common in WSL1, containers, SSH without lingering, or non-systemd distros)'
}

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  const temp = path + '.' + process.pid + '.tmp'
  writeFileSync(temp, content)
  renameSync(temp, path)
}

export async function runCommand(cmd, execute = spawnSync, delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  if (cmd.detached) {
    const child = spawn(cmd.argv[0], cmd.argv.slice(1), {
      detached: true, stdio: 'ignore', windowsVerbatimArguments: cmd.windowsVerbatimArguments ?? false,
    })
    child.on('error', () => {})
    child.unref()
    return true
  }
  let r
  for (let attempt = 0; attempt < (cmd.retry?.attempts ?? 1); attempt++) {
    r = execute(cmd.argv[0], cmd.argv.slice(1), { stdio: 'inherit' })
    if (!r.error && r.status === 0) break
    if (r.error || !cmd.retry?.statuses.includes(r.status) || attempt + 1 >= cmd.retry.attempts) break
    await delay(cmd.retry.delayMs)
  }
  const ok = !r.error && r.status === 0
  if (!ok && !cmd.allowFailure) {
    throw new SetupError(cmd.argv.join(' ') + ' failed' + (r.error ? ': ' + r.error.message : ' (exit ' + r.status + ')'))
  }
  return ok
}

function printPlan(plan) {
  console.log('Service manager: ' + plan.manager)
  for (const f of plan.files) console.log('\n--- ' + f.path + '\n' + f.content.trimEnd())
  if (plan.commands.length) console.log('\nCommands:\n' + plan.commands.map((c) => '  ' + c.argv.join(' ')).join('\n'))
  for (const n of plan.notes) console.log('Note: ' + n)
}

function context(platform) {
  const home = homedir()
  return {
    platform,
    home,
    uid: typeof process.getuid === 'function' ? process.getuid() : 0,
    node: serviceNodePath({ execPath: process.execPath, pathEnv: process.env.PATH, platform, realpath: realpathSync }),
    repo: REPO,
    env: process.env,
  }
}

async function installService(args) {
  const platform = args.platform ?? process.platform
  const ctx = context(platform)
  const where = serviceLocations({ platform, home: ctx.home, env: process.env })
  const existingText = args.platform ? null : existingDefinition(where)
  const plan = installPlan({ ...ctx, existingText, set: args.set, unset: args.unset, allowRemoteBind: args.allowRemoteBind })
  const locations = dataLocations({ env: plan.env, platform, home: ctx.home })

  if (args.dryRun) {
    if (args.platform && args.platform !== process.platform) {
      console.log('Foreign-platform rendering only: paths are from this host, not a validated target installation.')
    }
    printPlan(plan)
    console.log('\nData: sessions ' + locations.sessions + ' (' + locations.sessionsSource + '), models ' + locations.models + ', desk state ' + locations.deskState)
    console.log('Dry run: nothing was written or started.')
    return 0
  }
  const build = buildProblem()
  if (build) throw new SetupError(build)
  if (plan.manager === 'systemd') {
    const problem = systemdUserAvailable()
    if (problem) {
      throw new SetupError(
        'Cannot install a systemd user service: ' + problem + '.\n' +
          'Run Pi Office in the foreground instead ("npm start"), or under your own supervisor (tmux, runit, s6, ' +
          'OpenRC, a cron @reboot entry) with the same environment variables.',
      )
    }
  }
  for (const dir of plan.dirs) mkdirSync(dir, { recursive: true })
  for (const file of plan.files) writeAtomic(file.path, file.content)
  for (const cmd of plan.commands) await runCommand(cmd)
  for (const n of plan.notes) console.log('Note: ' + n)
  console.log('pi-office service installed (' + plan.manager + ') on ' + plan.url + ' from ' + REPO)
  console.log('Reading sessions from ' + locations.sessions + ' (' + locations.sessionsSource + '); desk state ' + locations.deskState)
  return 0
}

async function uninstallService(args) {
  const platform = args.platform ?? process.platform
  const ctx = context(platform)
  const plan = uninstallPlan({ platform, home: ctx.home, uid: ctx.uid, env: process.env })
  if (args.dryRun) {
    console.log('Service manager: ' + plan.manager)
    for (const c of [...plan.commands, ...plan.after]) console.log('  ' + c.argv.join(' '))
    for (const f of plan.remove) console.log('  remove ' + f)
    for (const n of plan.notes) console.log('Note: ' + n)
    console.log('Dry run: nothing was changed.')
    return 0
  }
  for (const c of plan.commands) await runCommand(c)
  for (const f of plan.remove) rmSync(f, { force: true })
  for (const c of plan.after) await runCommand(c)
  for (const n of plan.notes) console.log('Note: ' + n)
  console.log('pi-office service removed (' + plan.manager + ').')
  return 0
}

function nearestExisting(path) {
  let p = path
  while (!existsSync(p)) {
    const parent = dirname(p)
    if (parent === p) return p
    p = parent
  }
  return p
}

async function doctor() {
  let problems = 0
  const ok = (m) => console.log('  ok    ' + m)
  const warn = (m) => console.log('  warn  ' + m)
  const fail = (m) => {
    problems++
    console.log('  FAIL  ' + m)
  }
  const platform = process.platform
  const home = homedir()
  console.log('Pi Office doctor (' + platform + ', ' + REPO + ')')

  const nodeProblem = nodeVersionProblem(process.versions.node)
  if (nodeProblem) fail(nodeProblem)
  else ok('Node ' + process.version + ' at ' + real(process.execPath))

  const build = buildProblem()
  if (build) fail(build)
  else ok('production web build in dist/')

  const where = serviceLocations({ platform, home, env: process.env })
  const existingText = existingDefinition(where)
  const existing = where ? parseExistingEnv(where.manager, existingText) : {}
  const installedNode = where ? installedNodePath(where.manager, existingText) : null
  if (installedNode) {
    if (existsSync(installedNode)) ok('installed service Node: ' + installedNode)
    else fail('installed service Node no longer exists: ' + installedNode + '; rerun install-service using a current Node')
  }
  let env
  try {
    env = serviceEnv({ existing, isNewInstall: existingText === null, env: process.env, platform, home })
    ok('configuration valid: http://' + env.HOST + ':' + env.PORT + (existingText ? ' (installed service settings; shell overrides ignored on upgrades)' : ''))
    if (env.PI_OFFICE_ALLOWED_HOSTS) warn('public host(s) ' + env.PI_OFFICE_ALLOWED_HOSTS + ': review SECURITY.md (no authentication; metadata is public there)')
  } catch (error) {
    fail(error.message)
    env = { ...existing, ...process.env }
  }

  const data = dataLocations({ env, platform, home })
  let sessionsOk = false
  try {
    accessSync(data.sessions, constants.R_OK)
    sessionsOk = statSync(data.sessions).isDirectory()
  } catch {
    /* reported below */
  }
  if (sessionsOk) ok('Pi sessions: ' + data.sessions + ' (from ' + data.sessionsSource + ')')
  else {
    fail(
      'Pi sessions directory not readable: ' + data.sessions + ' (from ' + data.sessionsSource + '). Run Pi once, or set ' +
        'PI_OFFICE_SESSIONS_DIR to where Pi stores sessions (needed for --session-dir or project-local sessionDir).',
    )
  }
  const models = ['models-store.json', 'models.json'].filter((f) => existsSync(join(data.models, f)))
  if (models.length) ok('model names: ' + models.join(', ') + ' in ' + data.models)
  else warn('no models-store.json/models.json in ' + data.models + ': display names fall back to a heuristic')

  const stateRoot = nearestExisting(dirname(data.deskState))
  try {
    accessSync(stateRoot, constants.W_OK)
    ok('desk state: ' + data.deskState + (existsSync(data.deskState) ? ' (existing; seats are kept)' : ' (created on first assignment)'))
  } catch {
    warn('desk state ' + data.deskState + ' is not writable (' + stateRoot + '): seats will not survive restarts')
  }

  if (!where) warn('no built-in user service on ' + platform + ': use "npm start" under your own supervisor')
  else if (where.manager === 'systemd') {
    const problem = systemdUserAvailable()
    if (problem) warn('systemd user services unavailable (' + problem + '): use "npm start" in the foreground')
    else ok('systemd user services available' + (existingText ? '; ' + where.file + ' installed' : ''))
  } else {
    ok(where.manager + (existingText ? ': installed (' + (where.runner ?? where.file) + ')' : ': available, not installed'))
  }
  console.log(problems ? problems + ' problem(s) found.' : 'All checks passed.')
  return problems ? 1 : 0
}

export async function run(args) {
  try {
    if (args.command === 'doctor') return await doctor()
    if (args.command === 'install-service') return await installService(args)
    if (args.command === 'uninstall-service') return await uninstallService(args)
    console.error('Unknown command "' + args.command + '". Try: node scripts/setup.mjs help')
    return 2
  } catch (error) {
    if (error instanceof SetupError) {
      console.error('pi-office setup: ' + error.message)
      return 1
    }
    throw error
  }
}
