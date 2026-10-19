// Persisted hot-desk occupancy. The rules live in shared/desk-allocation.ts; this file only adds the state file.
//
// The state file is app-owned (never under ~/.pi). It survives restarts and deploys, so the people already at
// their desks keep them. Writes happen only when an assignment changes, and go through a temp file + rename.
import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  candidatesFor,
  emptyDeskPlan,
  isDeskIndex,
  randomPick,
  reconcileDesks,
  sameAssignments,
  withDesks,
  type DeskPick,
  type DeskPlan,
} from '../shared/desk-allocation.ts'
import type { OfficeSnapshot } from '../shared/office-types.ts'

export const DESK_STATE_VERSION = 1

/** `PI_OFFICE_STATE_FILE`, else `$XDG_STATE_HOME/pi-office/desks.json`, else `~/.local/state/pi-office/desks.json`. */
export function deskStateFile(): string {
  const explicit = process.env.PI_OFFICE_STATE_FILE
  if (explicit) return explicit
  const stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state')
  return join(stateHome, 'pi-office', 'desks.json')
}

/**
 * Read persisted assignments. Tolerant by design: a missing file is an empty office, and malformed entries are
 * dropped rather than trusted, so a bad file can never double-book a desk. Returns a warning for corrupt input.
 */
export function parseDeskState(text: string): { assignments: Map<string, number>; warning: string | null } {
  const assignments = new Map<string, number>()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { assignments, warning: 'desk state is not valid JSON; starting with an empty office' }
  }
  const entries = (raw as { assignments?: unknown } | null)?.assignments
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    return { assignments, warning: 'desk state has no assignments object; starting with an empty office' }
  }
  const taken = new Set<number>()
  for (const [id, desk] of Object.entries(entries)) {
    if (!id || !isDeskIndex(desk) || taken.has(desk)) continue
    assignments.set(id, desk)
    taken.add(desk)
  }
  return { assignments, warning: null }
}

export type DeskAllocatorOptions = {
  /** State file path. Omit for an in-memory allocator (tests, previews). */
  file?: string | null
  pick?: DeskPick
  now?: () => number
  warn?: (message: string) => void
}

/** Stateful wrapper: reconciles every snapshot against the occupancy and persists real changes. */
export class DeskAllocator {
  private plan: DeskPlan
  private readonly file: string | null
  private readonly pick: DeskPick
  private readonly warn: (message: string) => void
  private warned = new Set<string>()

  constructor(options: DeskAllocatorOptions = {}) {
    this.file = options.file ?? null
    this.pick = options.pick ?? randomPick
    this.warn = options.warn ?? ((message) => console.warn(`[pi-office] ${message}`))
    const plan = emptyDeskPlan()
    if (this.file) {
      try {
        const parsed = parseDeskState(readFileSync(this.file, 'utf8'))
        plan.assignments = parsed.assignments
        if (parsed.warning) this.warnOnce(parsed.warning)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.warnOnce(`cannot read desk state ${this.file}; starting with an empty office`)
        }
      }
    }
    this.plan = plan
  }

  /** Current occupancy (read-only view for diagnostics). */
  get assignments(): ReadonlyMap<string, number> {
    return this.plan.assignments
  }

  /**
   * Snapshot with `desk` filled in. Idempotent for the same roster and clock: re-applying an unchanged
   * snapshot changes nothing and writes nothing.
   */
  apply(snapshot: OfficeSnapshot): OfficeSnapshot {
    const next = reconcileDesks(this.plan, candidatesFor(snapshot), snapshot.now, this.pick)
    const changed = !sameAssignments(this.plan.assignments, next.assignments)
    this.plan = next
    if (changed) this.save()
    return withDesks(snapshot, next.assignments)
  }

  private save(): void {
    if (!this.file) return
    const sorted = [...this.plan.assignments.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    const body =
      JSON.stringify({ version: DESK_STATE_VERSION, assignments: Object.fromEntries(sorted) }, null, 2) + '\n'
    const temp = `${this.file}.${process.pid}.tmp`
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(temp, body)
      renameSync(temp, this.file)
    } catch {
      // Keep serving from memory; the office must not go down because the state dir is read-only.
      this.warnOnce(`cannot write desk state ${this.file}; occupancy will not survive a restart`)
      try {
        rmSync(temp, { force: true })
      } catch {
        /* best effort */
      }
    }
  }

  private warnOnce(message: string): void {
    if (this.warned.has(message)) return
    this.warned.add(message)
    this.warn(message)
  }
}
