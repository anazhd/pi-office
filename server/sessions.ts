// I/O: watch/tail Pi's session logs (read-only) and expose OfficeSnapshot / change notifications.
//
// Session files are append-only JSONL. The first scan reads them fully; afterwards only appended bytes are
// read (from a byte offset), so a half-written trailing line is simply picked up on the next pass. Deleted or
// truncated files drop their state. Nothing is ever written to ~/.pi.
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { OfficeSnapshot } from '../shared/office-types.ts'
import {
  applyEvent,
  emptyState,
  IncrementalRoster,
  parseChunk,
  sessionKey,
  type RosterEntry,
  type SessionState,
} from './parse.ts'
import { buildOfficeSnapshot, type SessionView } from './office.ts'
import { createNameResolver, type NameResolver } from './names.ts'

export const DEBOUNCE_MS = 300
export const TICK_MS = 5_000
export const SWEEP_MS = 60_000
/** A single line larger than this is skipped rather than buffered forever. */
const MAX_CHUNK_BYTES = 8 * 1024 * 1024
const MAX_LINE_BYTES = 64 * 1024 * 1024

/** The stat fields the scanner uses. */
export type SessionFileStat = { size: number; mtimeMs: number; dev: number; ino: number }

/** The read side of an open session file. */
export type SessionFileHandle = {
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>
  close(): Promise<void>
}

/**
 * The only fs calls the scanner makes. Injectable so tests can simulate EACCES / EMFILE / EBUSY / a vanished
 * file without permission tricks; the default is the real filesystem.
 */
export type SessionFileSystem = {
  stat(path: string): Promise<SessionFileStat>
  open(path: string): Promise<SessionFileHandle>
}

export const nodeSessionFileSystem: SessionFileSystem = {
  stat: (path) => stat(path),
  open: async (path) => {
    const fh = await open(path, 'r')
    return {
      read: (buffer, offset, length, position) => fh.read(buffer, offset, length, position),
      close: () => fh.close(),
    }
  },
}

export type FileState = {
  /**
   * Bytes parsed into `state` (complete lines only). Advanced per parsed chunk together with `state` and the
   * roster, so the two always agree, even when a later chunk of the same pass fails.
   */
  offset: number
  /**
   * Metadata of the last pass that completed cleanly (size also detects truncation inside a partial tail).
   * Only committed after a successful pass, never when a read fails, so a failure cannot make the file look
   * already consumed.
   */
  size: number
  mtime: number
  /** File identity; an atomic replace (new inode) restarts parsing from byte 0. */
  dev: number
  ino: number
  /**
   * The last pass failed (open/read/close). The next pass re-reads from `offset` even when the file's metadata
   * is unchanged. After a reset, `offset` is 0 and `state` is empty, so the retry is a full reparse.
   */
  needsRetry: boolean
  state: SessionState
}

export function sessionsDir(): string {
  const explicit = process.env.PI_OFFICE_SESSIONS_DIR
  if (explicit) return explicit
  const agentDir = process.env.PI_CODING_AGENT_DIR
  if (agentDir) return join(agentDir, 'sessions')
  return join(homedir(), '.pi', 'agent', 'sessions')
}

/** Directory holding models-store.json / models.json (Pi's config dir). */
export function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent')
}

/** Local server midnight for `now`. */
export function startOfLocalDay(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null // missing or invalid: display-name fallback takes over
  }
}

/** Load model display names from both Pi model stores (read-only, tolerant of missing files). */
export async function loadNameResolver(): Promise<NameResolver> {
  const dir = agentDir()
  const [store, models] = await Promise.all([
    readJson(join(dir, 'models-store.json')),
    readJson(join(dir, 'models.json')),
  ])
  return createNameResolver([store, models])
}

async function listSessionFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.jsonl')) out.push(join(e.parentPath, e.name))
  }
  out.sort()
  return out
}

/** Watches the sessions directory and keeps per-session state + lifetime roster aggregates in memory. */
export class OfficeStore {
  readonly dir: string
  private files = new Map<string, FileState>()
  private version = 0
  private roster = new IncrementalRoster(startOfLocalDay(Date.now()))
  private nameFor: NameResolver = createNameResolver([])
  private readonly fsys: SessionFileSystem
  private listeners = new Set<() => void>()
  private watcher: FSWatcher | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private tick: ReturnType<typeof setInterval> | null = null
  private sweep: ReturnType<typeof setInterval> | null = null
  private running: Promise<void> | null = null
  private again = false
  private ready: Promise<void> | null = null

  constructor(dir: string, fsys: SessionFileSystem = nodeSessionFileSystem) {
    this.dir = dir
    this.fsys = fsys
  }

  /** Start watching and resolve after the first full scan. */
  start(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        this.nameFor = await loadNameResolver()
        await this.scan()
      })()
      this.attachWatcher()
      // Time-based transitions (stale -> idle) and a fallback for missed watch events.
      this.tick = setInterval(() => void this.scan(), TICK_MS)
      this.tick.unref()
      // Slow full directory sweep: catches files created while watch was unavailable.
      this.sweep = setInterval(() => {
        this.attachWatcher()
        void this.scan()
      }, SWEEP_MS)
      this.sweep.unref()
    }
    return this.ready
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.debounce) clearTimeout(this.debounce)
    if (this.tick) clearInterval(this.tick)
    if (this.sweep) clearInterval(this.sweep)
    this.debounce = null
    this.tick = null
    this.sweep = null
  }

  /** Force a scan now (tests, and after startup when callers want the freshest state). */
  async refresh(): Promise<void> {
    await this.scan()
  }

  /** Subscribe to "the snapshot may have changed" (debounced file changes + ticks). */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try {
        fn()
      } catch {
        /* a broken listener must not break the watcher */
      }
    }
  }

  private attachWatcher(): void {
    if (this.watcher) return
    try {
      this.watcher = watch(this.dir, { recursive: true }, () => this.schedule())
      this.watcher.on('error', () => {
        this.watcher?.close()
        this.watcher = null
      })
    } catch {
      this.watcher = null // missing dir / no recursive watch support: the intervals cover it
    }
  }

  private schedule(): void {
    if (this.debounce) return
    this.debounce = setTimeout(() => {
      this.debounce = null
      void this.scan()
    }, DEBOUNCE_MS)
  }

  /** Scans never overlap; a request landing mid-scan schedules exactly one more pass. */
  private scan(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      try {
        do {
          this.again = false
          const changed = await this.scanOnce()
          if (changed) {
            this.version++
            this.emit()
          }
        } while (this.again)
      } catch {
        // never let a bad file take the server down
      } finally {
        this.running = null
      }
    })()
    return this.running
  }

  private async scanOnce(): Promise<boolean> {
    let changed = false
    const seen = new Set<string>()
    for (const file of await listSessionFiles(this.dir)) {
      seen.add(file)
      try {
        changed = (await this.readFile(file)) || changed
      } catch {
        // vanished mid-scan or unreadable: retry next pass
      }
    }
    for (const file of [...this.files.keys()]) {
      if (!seen.has(file)) {
        this.dropFile(file)
        this.files.delete(file)
        changed = true
      }
    }
    return changed
  }

  /** Subtract everything a file contributed from the roster. Returns true when anything was removed. */
  private dropFile(file: string): boolean {
    const entry = this.files.get(file)
    if (!entry) return false
    for (const c of entry.state.contributions) this.roster.remove(c, file)
    return entry.state.contributions.length > 0
  }

  /**
   * Start a file over from byte 0. Synchronous: contributions are subtracted and the state is emptied in one
   * step, so an I/O failure afterwards leaves an empty state (retry = full reparse), never a half-subtracted one.
   */
  private resetFile(file: string, entry: FileState): boolean {
    const removed = this.dropFile(file)
    entry.state = emptyState()
    entry.offset = 0
    entry.needsRetry = true
    return removed
  }

  /**
   * Bring one file up to date. Returns true when the snapshot may have changed. Throws only if stat fails, which
   * happens before any state is touched; open/read/close failures are recorded (needsRetry) and retried by the
   * next pass whatever the file's metadata says.
   */
  private async readFile(file: string): Promise<boolean> {
    // Observed metadata: decides what to do, and is committed below only after a clean pass.
    const info = await this.fsys.stat(file)
    const size = info.size
    const mtime = Number.isFinite(info.mtimeMs) ? info.mtimeMs : Date.now()
    const dev = Number(info.dev)
    const ino = Number(info.ino)

    let changed = false
    let entry = this.files.get(file)
    if (!entry) {
      entry = { offset: 0, size: 0, mtime: 0, dev, ino, needsRetry: true, state: emptyState() }
      this.files.set(file, entry)
    } else {
      // Atomic replace (new inode), truncation (also inside a partial tail: offset may be past the size),
      // or same size with a new mtime (bytes may have been overwritten in place): reparse from 0.
      const replaced = entry.dev !== dev || entry.ino !== ino
      const shrunk = size < Math.max(entry.size, entry.offset)
      const rewritten = size === entry.size && mtime !== entry.mtime
      if (replaced || shrunk || rewritten) {
        changed = this.resetFile(file, entry)
      } else if (!entry.needsRetry && size === entry.size && mtime === entry.mtime) {
        return false
      }
      // Otherwise: a plain append (or a retry of a failed pass) resumes from the consumed offset.
    }

    let added = false
    let chunk = MAX_CHUNK_BYTES
    try {
      const fh = await this.fsys.open(file)
      try {
        while (entry.offset < size) {
          const length = Math.min(size - entry.offset, chunk)
          const buf = Buffer.allocUnsafe(length)
          const { bytesRead } = await fh.read(buf, 0, length, entry.offset)
          if (bytesRead === 0) break
          // Only consume complete lines; the tail may be a half-written line or half a multi-byte character.
          const end = buf.lastIndexOf(10, bytesRead - 1) + 1
          if (end === 0) {
            if (entry.offset + bytesRead >= size) break // partial last line: wait for the rest
            if (chunk >= MAX_LINE_BYTES) {
              // Degenerate line with no newline: skip it instead of buffering it forever.
              entry.offset += bytesRead
              chunk = MAX_CHUNK_BYTES
              continue
            }
            chunk *= 2 // a single line longer than the current chunk
            continue
          }
          chunk = MAX_CHUNK_BYTES
          const { events } = parseChunk(buf.toString('utf8', 0, end))
          for (const ev of events) {
            const contribution = applyEvent(entry.state, ev)
            if (contribution) this.roster.add(contribution, file)
          }
          entry.offset += end
          if (events.length > 0) added = true
        }
      } finally {
        await fh.close()
      }
    } catch {
      // Keep what was parsed (state and offset agree). The next pass re-reads from here regardless of metadata.
      entry.needsRetry = true
      return changed || added
    }

    // Clean pass: commit the metadata observed before reading. Any append during the read shows up as a size
    // change on the next pass. A partial tail counts as a change too, as before.
    entry.size = size
    entry.mtime = mtime
    entry.dev = dev
    entry.ino = ino
    entry.needsRetry = false
    return changed || added || entry.offset < size
  }

  /** Session views for the snapshot (only files that belong to a session and have a model). */
  private views(): SessionView[] {
    const out: SessionView[] = []
    for (const [file, fs] of this.files) {
      const id = fs.state.id ?? file // untitled file: still gives a stable key
      out.push({
        key: sessionKey(id),
        project: fs.state.project ?? 'unknown',
        status: fs.state.status,
        tool: fs.state.tool,
        since: fs.state.lastTs,
        mtime: fs.mtime,
        provider: fs.state.provider,
        model: fs.state.model,
      })
    }
    return out
  }

  private rosterFor(dayStart: number): Iterable<RosterEntry> {
    this.roster.setDay(dayStart)
    return this.roster.entries()
  }

  /** Current office snapshot. */
  snapshot(now = Date.now()): OfficeSnapshot {
    const dayStart = startOfLocalDay(now)
    return buildOfficeSnapshot({
      now,
      sessions: this.views(),
      roster: this.rosterFor(dayStart),
      nameFor: this.nameFor,
    })
  }
}
