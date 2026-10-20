// I/O: watch/tail Pi's session logs (read-only) and expose OfficeSnapshot / change notifications.
//
// Session files are append-only JSONL. The first scan reads them fully; afterwards only appended bytes are
// read (from a byte offset), so a half-written trailing line is simply picked up on the next pass. Deleted or
// truncated files drop their state. Nothing is ever written to ~/.pi.
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { piAgentDir, piSessionsDir } from './paths.ts'
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
import { DeskAllocator } from './desks.ts'

export const DEBOUNCE_MS = 300
export const TICK_MS = 5_000
export const SWEEP_MS = 60_000
/** Read size per pass step. A single line larger than MAX_LINE_BYTES is skipped rather than buffered. */
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024
export const MAX_LINE_BYTES = 64 * 1024 * 1024

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
  /**
   * Bytes after `offset` already scanned and known to hold no newline (a half-written trailing line). The next
   * pass only reads bytes after them, so a growing partial line is never re-read from its start.
   */
  pending: number
  /** Inside a line longer than MAX_LINE_BYTES: discard bytes up to and including its newline. */
  skipping: boolean
  state: SessionState
}

/** `PI_OFFICE_SESSIONS_DIR`, else `PI_CODING_AGENT_DIR/sessions`, else `~/.pi/agent/sessions` (server/paths.ts). */
export function sessionsDir(): string {
  return piSessionsDir()
}

/** Directory holding models-store.json / models.json (Pi's config dir); same rule as the sessions parent. */
export function agentDir(): string {
  return piAgentDir()
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
  private readonly now: () => number
  private readonly maxChunkBytes: number
  private readonly maxLineBytes: number
  private roster: IncrementalRoster
  private nameFor: NameResolver = createNameResolver([])
  private readonly fsys: SessionFileSystem
  /** Authoritative hot-desk occupancy; applied to every snapshot. */
  private readonly desks: DeskAllocator
  private listeners = new Set<() => void>()
  private watcher: FSWatcher | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private tick: ReturnType<typeof setInterval> | null = null
  private sweep: ReturnType<typeof setInterval> | null = null
  private running: Promise<void> | null = null
  private again = false
  private ready: Promise<void> | null = null

  constructor(
    dir: string,
    fsys: SessionFileSystem = nodeSessionFileSystem,
    desks: DeskAllocator = new DeskAllocator(),
    options: { now?: () => number; maxChunkBytes?: number; maxLineBytes?: number } = {},
  ) {
    this.dir = dir
    this.fsys = fsys
    this.desks = desks
    this.now = options.now ?? Date.now
    this.maxChunkBytes = options.maxChunkBytes ?? MAX_CHUNK_BYTES
    this.maxLineBytes = options.maxLineBytes ?? MAX_LINE_BYTES
    this.roster = new IncrementalRoster(startOfLocalDay(this.now()))
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
    this.desks.flush()
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
    entry.pending = 0
    entry.skipping = false
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
    const mtime = Number.isFinite(info.mtimeMs) ? info.mtimeMs : this.now()
    const dev = Number(info.dev)
    const ino = Number(info.ino)

    let changed = false
    let entry = this.files.get(file)
    if (!entry) {
      entry = { offset: 0, size: 0, mtime: 0, dev, ino, needsRetry: true, pending: 0, skipping: false, state: emptyState() }
      this.files.set(file, entry)
    } else {
      // Atomic replace (new inode), truncation (also inside a partial tail: offset may be past the size),
      // or same size with a new mtime (bytes may have been overwritten in place): reparse from 0.
      const replaced = entry.dev !== dev || entry.ino !== ino
      const shrunk = size < Math.max(entry.size, entry.offset + entry.pending)
      const rewritten = size === entry.size && mtime !== entry.mtime
      if (replaced || shrunk || rewritten) {
        changed = this.resetFile(file, entry)
      } else if (!entry.needsRetry && size === entry.size && mtime === entry.mtime) {
        return false
      }
      // Otherwise: a plain append (or a retry of a failed pass) resumes from the consumed offset.
    }

    let added = false
    const consume = (buf: Buffer, start: number, end: number) => {
      const { events } = parseChunk(buf.toString('utf8', start, end))
      for (const ev of events) {
        const contribution = applyEvent(entry.state, ev)
        if (contribution) this.roster.add(contribution, file)
      }
      if (events.length > 0) added = true
    }
    try {
      const fh = await this.fsys.open(file)
      try {
        // Every byte is read once while scanning for newlines; only a line that spans passes/chunks is read a
        // second time, once, when its newline arrives. Only complete lines are consumed: the tail may be a
        // half-written line or half a multi-byte character.
        while (entry.offset + entry.pending < size) {
          const from = entry.offset + entry.pending
          const length = Math.min(size - from, this.maxChunkBytes)
          const buf = Buffer.allocUnsafe(length)
          const { bytesRead } = await fh.read(buf, 0, length, from)
          if (bytesRead === 0) break
          const first = buf.indexOf(10)
          if (first < 0 || first >= bytesRead) {
            entry.pending += bytesRead
            if (entry.pending > this.maxLineBytes) {
              // Degenerate line: drop what we have and discard the rest of it instead of buffering it.
              entry.offset += entry.pending
              entry.pending = 0
              entry.skipping = true
            }
            continue
          }
          const last = buf.lastIndexOf(10, bytesRead - 1)
          if (entry.skipping) {
            entry.skipping = false
          } else if (entry.pending + first + 1 > this.maxLineBytes) {
            // The spanned line ends here but is over the limit: drop it without buffering it.
          } else if (entry.pending > 0) {
            // The line started in an earlier chunk/pass: read it whole, exactly once.
            const lineLength = entry.pending + first + 1
            const line = Buffer.allocUnsafe(lineLength)
            const got = await fh.read(line, 0, lineLength, entry.offset)
            if (got.bytesRead < lineLength) throw new Error('short read')
            consume(line, 0, lineLength)
          } else {
            consume(buf, 0, first + 1)
          }
          entry.offset = from + first + 1
          entry.pending = 0
          if (last > first) {
            consume(buf, first + 1, last + 1)
            entry.offset = from + last + 1
          }
          entry.pending = bytesRead - (last + 1)
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

  /** Current office snapshot, with each character's desk reconciled against the persisted occupancy. */
  snapshot(now = this.now()): OfficeSnapshot {
    const dayStart = startOfLocalDay(now)
    return this.desks.apply(
      buildOfficeSnapshot({
        now,
        sessions: this.views(),
        roster: this.rosterFor(dayStart),
        nameFor: this.nameFor,
      }),
    )
  }
}
