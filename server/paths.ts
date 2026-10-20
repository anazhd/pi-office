// Where Pi Office reads Pi's data and keeps its own state. Pure: every input (env, platform, home, file probe) is a
// parameter, so the Windows/macOS/Linux rules are unit tested on any OS.
//
// Pi data is located by environment, never by where the `pi` binary or its npm package is installed:
//   sessions: PI_OFFICE_SESSIONS_DIR, else PI_CODING_AGENT_SESSION_DIR, else PI_CODING_AGENT_DIR/sessions,
//             else <home>/.pi/agent/sessions
//   models:   PI_CODING_AGENT_DIR, else <home>/.pi/agent   (models-store.json, models.json)
// Pi-owned variables are expanded the way Pi expands them (~, ~/x, Windows ~\x, /c/x and /mnt/c/x shell paths on
// Windows, file:// URLs). Pi's global settings.json "sessionDir" is honoured (read-only) after the env vars. A dir
// chosen only by Pi's --session-dir flag or a project-local .pi/settings.json is invisible from here: set
// PI_OFFICE_SESSIONS_DIR to it. Everything here is read-only; the only file
// Pi Office writes is its desk state (deskStatePath), never under ~/.pi.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Env = Readonly<Record<string, string | undefined>>
export type PathOptions = {
  env?: Env
  platform?: NodeJS.Platform
  home?: string
  /** File probe for the legacy desk-state location (tests inject one). */
  exists?: (path: string) => boolean
  /** Text reader for Pi's global settings.json (read-only; tests inject one). Null when missing/unreadable. */
  readText?: (path: string) => string | null
}

function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** Non-empty, trimmed env value (an empty or whitespace-only variable counts as unset everywhere). */
export function envValue(env: Env, key: string): string | null {
  const value = env[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function pathApi(platform: NodeJS.Platform) {
  return platform === 'win32' ? win32 : posix
}

function resolved(options: PathOptions) {
  const platform = options.platform ?? process.platform
  return {
    env: options.env ?? process.env,
    platform,
    home: options.home ?? homedir(),
    exists: options.exists ?? existsSync,
    readText: options.readText ?? readTextOrNull,
    path: pathApi(platform),
  }
}

/**
 * Expand a user-supplied directory like Pi's normalizePath: Windows shell paths (/c/x, /mnt/c/x, /cygdrive/c/x)
 * on Windows, a leading ~ (also ~\ on Windows), and file:// URLs. Relative results are left relative.
 */
export function expandUserPath(value: string, options: PathOptions = {}): string {
  const { platform, home, path } = resolved(options)
  let out = value
  if (platform === 'win32' && out.startsWith('/') && !out.startsWith('//') && !out.includes('\\')) {
    const m = out.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i)
    if (m) out = m[1].toUpperCase() + ':\\' + (m[2] ?? '').replaceAll('/', '\\')
  }
  if (out === '~') return home
  if (out.startsWith('~/') || (platform === 'win32' && out.startsWith('~\\'))) return path.join(home, out.slice(2))
  if (/^file:\/\//i.test(out)) {
    try {
      return fileURLToPath(out, { windows: platform === 'win32' })
    } catch {
      return out
    }
  }
  return out
}

function envPath(key: string, options: PathOptions): string | null {
  const value = envValue(resolved(options).env, key)
  return value === null ? null : expandUserPath(value, options)
}

/** Pi's agent directory (models-store.json / models.json, and the default sessions parent). */
export function piAgentDir(options: PathOptions = {}): string {
  const { home, path } = resolved(options)
  return envPath('PI_CODING_AGENT_DIR', options) ?? path.join(home, '.pi', 'agent')
}

/** Which rule picked the sessions directory (shown by `setup doctor`). */
export type SessionsDirSource =
  | 'PI_OFFICE_SESSIONS_DIR'
  | 'PI_CODING_AGENT_SESSION_DIR'
  | 'settings.json'
  | 'PI_CODING_AGENT_DIR'
  | 'default'

/** Pi's global settings.json "sessionDir", expanded; null when unset, unreadable, invalid or not absolute. */
export function settingsSessionDir(options: PathOptions = {}): string | null {
  const { readText, path } = resolved(options)
  const text = readText(path.join(piAgentDir(options), 'settings.json'))
  if (!text) return null
  let value: unknown
  try {
    value = (JSON.parse(text) as { sessionDir?: unknown } | null)?.sessionDir
  } catch {
    return null
  }
  if (typeof value !== 'string' || !value.trim()) return null
  const dir = expandUserPath(value, options)
  return path.isAbsolute(dir) ? dir : null // a relative value depends on Pi's cwd; ask for an explicit override
}

/** Pi's session log directory (read-only) and the rule that chose it. */
export function piSessionsLocation(options: PathOptions = {}): { dir: string; source: SessionsDirSource } {
  const { path } = resolved(options)
  const office = envPath('PI_OFFICE_SESSIONS_DIR', options)
  if (office) return { dir: office, source: 'PI_OFFICE_SESSIONS_DIR' }
  const pi = envPath('PI_CODING_AGENT_SESSION_DIR', options)
  if (pi) return { dir: pi, source: 'PI_CODING_AGENT_SESSION_DIR' }
  const fromSettings = settingsSessionDir(options)
  if (fromSettings) return { dir: fromSettings, source: 'settings.json' }
  const source = envValue(resolved(options).env, 'PI_CODING_AGENT_DIR') ? 'PI_CODING_AGENT_DIR' : 'default'
  return { dir: path.join(piAgentDir(options), 'sessions'), source }
}

export function piSessionsDir(options: PathOptions = {}): string {
  return piSessionsLocation(options).dir
}

/** Linux default and the legacy location on every OS: `$XDG_STATE_HOME` or `<home>/.local/state`. */
export function legacyDeskStateFile(options: PathOptions = {}): string {
  const { env, home, path } = resolved(options)
  const stateHome = envValue(env, 'XDG_STATE_HOME') ?? path.join(home, '.local', 'state')
  return path.join(stateHome, 'pi-office', 'desks.json')
}

/**
 * The app-owned desk occupancy file:
 *   1. PI_OFFICE_STATE_FILE
 *   2. Linux/BSD: $XDG_STATE_HOME/pi-office/desks.json or ~/.local/state/pi-office/desks.json (unchanged)
 *   3. macOS/Windows: an explicit XDG_STATE_HOME or an existing legacy ~/.local/state file keeps working;
 *      otherwise ~/Library/Application Support/pi-office/desks.json (macOS) or
 *      %LOCALAPPDATA%\pi-office\desks.json (Windows).
 */
export function deskStatePath(options: PathOptions = {}): string {
  const { env, platform, home, exists, path } = resolved(options)
  const explicit = envPath('PI_OFFICE_STATE_FILE', options)
  if (explicit) return explicit
  const legacy = legacyDeskStateFile(options)
  if (platform !== 'darwin' && platform !== 'win32') return legacy
  if (envValue(env, 'XDG_STATE_HOME') || exists(legacy)) return legacy
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'pi-office', 'desks.json')
  const local = envValue(env, 'LOCALAPPDATA') ?? path.join(home, 'AppData', 'Local')
  return path.join(local, 'pi-office', 'desks.json')
}

/** True when `candidate` is `root` or inside it (both already absolute and normalised for `platform`). */
export function isInside(root: string, candidate: string, platform: NodeJS.Platform = process.platform): boolean {
  const path = pathApi(platform)
  const rel = path.relative(root, candidate)
  if (rel === '') return true
  if (path.isAbsolute(rel)) return false // another drive on Windows
  return rel !== '..' && !rel.startsWith('..' + path.sep)
}
