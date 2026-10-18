// Pure snapshot builder: session states + lifetime roster + clock -> OfficeSnapshot. No I/O.
import type { ActivityStatus, Character, OfficeSnapshot } from '../shared/office-types.ts'
import type { RosterEntry } from './parse.ts'

/** A session that has not been written to for this long is considered crashed -> idle. */
export const STALE_MS = 10 * 60_000

/** Gamification thresholds. */
export const XP_PER_LEVEL = 2000

/** xp = lifetime output tokens. */
export function levelForXp(xp: number): number {
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0
  return Math.floor(Math.sqrt(safe / XP_PER_LEVEL)) + 1
}

/** XP required to reach `level` (level 1 starts at 0). */
export function xpForLevel(level: number): number {
  const n = Math.max(1, level)
  return XP_PER_LEVEL * (n - 1) * (n - 1)
}

export function titleForLevel(level: number): string {
  if (level <= 2) return 'Intern'
  if (level <= 4) return 'Junior'
  if (level <= 7) return 'Engineer'
  if (level <= 11) return 'Senior'
  if (level <= 16) return 'Staff'
  return 'Principal'
}

/** 0..1 progress from the current level's threshold to the next one. */
export function levelProgress(xp: number): number {
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0
  const level = levelForXp(safe)
  const from = xpForLevel(level)
  const to = xpForLevel(level + 1)
  if (to <= from) return 0
  const p = (safe - from) / (to - from)
  return p < 0 ? 0 : p > 1 ? 1 : p
}

/** What the I/O layer knows about one session file. */
export type SessionView = {
  /** Hashed session key (short sha1). */
  key: string
  project: string
  status: ActivityStatus
  tool: string | null
  /** Epoch ms of the last relevant line. */
  since: number
  /** File mtime, epoch ms (used for the stale timeout). */
  mtime: number
  provider: string | null
  model: string | null
}

export type SnapshotInput = {
  now: number
  sessions: readonly SessionView[]
  roster: Iterable<RosterEntry>
  nameFor: (provider: string, model: string) => string
}

/** Resolve a session's effective status, applying the stale timeout. */
export function effectiveStatus(session: SessionView, now: number): ActivityStatus {
  if (session.status === 'idle') return 'idle'
  if (!session.provider || !session.model) return 'idle'
  if (!(now - session.mtime <= STALE_MS)) return 'idle'
  return session.status
}

/** Build the full office snapshot from session states and the lifetime roster. */
export function buildOfficeSnapshot(input: SnapshotInput): OfficeSnapshot {
  const { now, sessions, nameFor } = input

  const activeByModel = new Map<string, OfficeSnapshot['characters'][number]['active']>()
  let activeSessions = 0
  for (const s of sessions) {
    if (effectiveStatus(s, now) === 'idle') continue
    activeSessions++
    const id = `${s.provider}/${s.model}`
    const list = activeByModel.get(id) ?? []
    list.push({
      key: s.key,
      project: s.project,
      status: s.status === 'tool' ? 'tool' : 'thinking',
      tool: s.status === 'tool' ? s.tool : null,
      since: s.since,
    })
    activeByModel.set(id, list)
  }
  for (const list of activeByModel.values()) list.sort((a, b) => b.since - a.since)

  const characters: Character[] = []
  for (const entry of input.roster) {
    const active = activeByModel.get(entry.id) ?? []
    const status: ActivityStatus =
      active.length === 0 ? 'idle' : active.some((a) => a.status === 'tool') ? 'tool' : 'thinking'
    const xp = entry.outputTokens
    const level = levelForXp(xp)
    characters.push({
      id: entry.id,
      provider: entry.provider,
      model: entry.model,
      displayName: nameFor(entry.provider, entry.model),
      stats: {
        messages: entry.messages,
        outputTokens: entry.outputTokens,
        inputTokens: entry.inputTokens,
        toolCalls: entry.toolCalls,
        sessions: entry.sessions,
        todayOutputTokens: entry.todayOutputTokens,
        firstSeen: entry.firstSeen,
        lastSeen: entry.lastSeen,
      },
      level,
      title: titleForLevel(level),
      xp,
      levelProgress: levelProgress(xp),
      status,
      active,
    })
  }

  // Stable seating order: oldest character first, id as tie-breaker.
  characters.sort((a, b) => a.stats.firstSeen - b.stats.firstSeen || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  let todayOutputTokens = 0
  let lifetimeOutputTokens = 0
  let workingCharacters = 0
  for (const c of characters) {
    todayOutputTokens += c.stats.todayOutputTokens
    lifetimeOutputTokens += c.stats.outputTokens
    if (c.status !== 'idle') workingCharacters++
  }

  return {
    now,
    characters,
    totals: { activeSessions, workingCharacters, todayOutputTokens, lifetimeOutputTokens },
  }
}
