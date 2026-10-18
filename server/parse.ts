// Pure parsing/aggregation of Pi session logs. No I/O, unit tested.
//
// Pi appends one JSON object per line to ~/.pi/agent/sessions/<cwd-slug>/<iso>_<uuid>.jsonl.
// Only a few line types matter for the office:
//   session            -> header (id, cwd)
//   model_change       -> provider + modelId
//   message/user       -> a turn started (model is thinking)
//   message/assistant  -> a finished reply (with usage + stopReason + toolCalls) -> roster sample
//   message/toolResult -> a tool finished (model is thinking again)
// Everything else (session_info, custom, system, thinking_level_change, ...) is ignored. In particular
// session_info names and any message content must never leave this module.
import { createHash } from 'node:crypto'
import type { ActivityStatus } from '../shared/office-types.ts'

/** Short stable hash of a session id; the raw id (and any path) is never sent to clients. */
export function sessionKey(id: string): string {
  return createHash('sha1').update(id).digest('hex').slice(0, 10)
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const nonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
const isoMs = (v: unknown): number | null => {
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}
const epochMs = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null

/** basename(cwd) without pulling in node:path (and without ever exposing more of the path). */
export function projectName(cwd: string): string {
  const trimmed = cwd.replace(/[/\\]+$/, '')
  const base = trimmed.slice(Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1)
  return base || trimmed || 'unknown'
}

export type SessionEvent =
  | { kind: 'session'; id: string; project: string; ts: number }
  | { kind: 'modelChange'; provider: string; model: string; ts: number }
  | { kind: 'user'; ts: number }
  | { kind: 'toolResult'; toolName: string | null; ts: number }
  | {
      kind: 'assistant'
      provider: string | null
      model: string | null
      stopReason: string | null
      /** Names of toolCall content items, in order. Arguments are never read. */
      tools: string[]
      /** Output tokens of the reply. */
      out: number
      /** input + cacheRead + cacheWrite. */
      inp: number
      /** Reply end time (line timestamp). */
      ts: number
      /** Request start (message.timestamp), part of the de-dupe key. */
      startedAt: number
    }

/** Turn one JSONL line into an event, or null when the line is irrelevant/corrupt/partial. */
export function parseEvent(line: string): SessionEvent | null {
  const s = line.trim()
  if (!s.startsWith('{')) return null
  let e: any
  try {
    e = JSON.parse(s)
  } catch {
    return null // partial trailing line or corruption
  }
  if (!e || typeof e !== 'object') return null
  const lineTs = isoMs(e.timestamp)

  switch (e.type) {
    case 'session': {
      const id = str(e.id)
      if (!id) return null
      return {
        kind: 'session',
        id,
        project: projectName(str(e.cwd) ?? ''),
        ts: lineTs ?? 0,
      }
    }
    case 'model_change': {
      const provider = str(e.provider)
      const model = str(e.modelId) ?? str(e.model)
      if (!provider || !model) return null
      return { kind: 'modelChange', provider, model, ts: lineTs ?? 0 }
    }
    case 'message': {
      const m = e.message
      if (!m || typeof m !== 'object') return null
      const ts = lineTs ?? epochMs(m.timestamp) ?? 0
      if (m.role === 'user') return { kind: 'user', ts }
      if (m.role === 'toolResult') {
        return { kind: 'toolResult', toolName: str(m.toolName), ts }
      }
      if (m.role !== 'assistant') return null

      const content: unknown[] = Array.isArray(m.content) ? m.content : []
      const tools: string[] = []
      for (const item of content) {
        const c = item as any
        if (c && typeof c === 'object' && c.type === 'toolCall') {
          const name = str(c.name)
          if (name) tools.push(name)
        }
      }
      const usage = m.usage && typeof m.usage === 'object' ? m.usage : {}
      return {
        kind: 'assistant',
        provider: str(m.provider),
        model: str(m.model),
        stopReason: str(m.stopReason),
        tools,
        out: nonNeg(usage.output),
        inp: nonNeg(usage.input) + nonNeg(usage.cacheRead) + nonNeg(usage.cacheWrite),
        ts,
        startedAt: epochMs(m.timestamp) ?? ts,
      }
    }
    default:
      return null // session_info, thinking_level_change, custom, system, ...
  }
}

/** One assistant reply, reduced to the numbers the roster needs. Carries no content. */
export type Contribution = {
  /** provider:model:message.timestamp:usage.output — de-dupes forked copies of one reply. */
  key: string
  provider: string
  model: string
  /** model id as `${provider}/${model}`. */
  modelId: string
  out: number
  inp: number
  tools: number
  /** Reply end time, epoch ms. */
  ts: number
  /** Raw session id, only used to count distinct sessions. Never serialized. */
  sessionId: string | null
}

/**
 * Compact per-file record: exactly what the incremental roster needs to add a reply, and to subtract it again
 * when its file is truncated/replaced. Provider/model are folded into `charId` to avoid repeating strings.
 */
export type CompactContribution = {
  /** De-dupe key (see Contribution.key). */
  key: string
  /** `${provider}/${model}`. */
  charId: string
  out: number
  inp: number
  tools: number
  /** Reply end time, epoch ms. */
  ts: number
  /** Raw session id, only used to count distinct sessions. Never serialized. */
  sessionId: string | null
}

/** Per-session state derived from the last relevant line. */
export type SessionState = {
  id: string | null
  project: string | null
  status: ActivityStatus
  /** Tool name when status === 'tool'. */
  tool: string | null
  provider: string | null
  model: string | null
  /** Epoch ms of the last relevant line (0 when none). */
  lastTs: number
  /** Compact assistant replies seen in this file, so a reset can subtract exactly what it added. */
  contributions: CompactContribution[]
}

export function emptyState(): SessionState {
  return {
    id: null,
    project: null,
    status: 'idle',
    tool: null,
    provider: null,
    model: null,
    lastTs: 0,
    contributions: [],
  }
}

/**
 * Apply one event to the session state (mutates, for tailing efficiency). The status table is the one from
 * the spec: user/toolResult -> thinking, assistant toolUse -> tool, any other assistant ending -> idle,
 * header/model_change only -> idle.
 *
 * Returns the compact roster record when the event added one (the I/O layer feeds it to the incremental
 * aggregator), otherwise null.
 */
export function applyEvent(state: SessionState, event: SessionEvent): CompactContribution | null {
  switch (event.kind) {
    case 'session': {
      state.id = event.id
      state.project = event.project
      state.lastTs = Math.max(state.lastTs, event.ts)
      return null
    }
    case 'modelChange': {
      state.provider = event.provider
      state.model = event.model
      state.status = 'idle'
      state.tool = null
      state.lastTs = Math.max(state.lastTs, event.ts)
      return null
    }
    case 'user': {
      state.status = 'thinking'
      state.tool = null
      state.lastTs = Math.max(state.lastTs, event.ts)
      return null
    }
    case 'toolResult': {
      state.status = 'thinking'
      state.tool = null
      state.lastTs = Math.max(state.lastTs, event.ts)
      return null
    }
    case 'assistant': {
      state.lastTs = Math.max(state.lastTs, event.ts)
      if (event.provider) state.provider = event.provider
      if (event.model) state.model = event.model
      if (event.stopReason === 'toolUse') {
        state.status = 'tool'
        state.tool = event.tools.length > 0 ? event.tools[event.tools.length - 1] : null
        if (state.tool === null) state.status = 'thinking'
      } else {
        state.status = 'idle'
        state.tool = null
      }
      const provider = event.provider
      const model = event.model
      if (!provider || !model) return null
      const contribution: CompactContribution = {
        key: `${provider}:${model}:${event.startedAt}:${event.out}`,
        charId: `${provider}/${model}`,
        out: event.out,
        inp: event.inp,
        tools: event.tools.length,
        ts: event.ts,
        sessionId: state.id,
      }
      state.contributions.push(contribution)
      return contribution
    }
  }
}

/**
 * Parse the complete lines in `chunk` (everything up to the last newline) into events, and report how many
 * characters were consumed so a tailer can resume after a partially written trailing line.
 */
export function parseChunk(chunk: string): { events: SessionEvent[]; consumed: number } {
  const end = chunk.lastIndexOf('\n') + 1
  const events: SessionEvent[] = []
  let from = 0
  while (from < end) {
    const to = chunk.indexOf('\n', from)
    const stop = to < 0 || to > end ? end : to
    const ev = parseEvent(chunk.slice(from, stop))
    if (ev) events.push(ev)
    from = stop + 1
  }
  return { events, consumed: end }
}

/** Lifetime aggregates for one character (provider/model). */
export type RosterEntry = {
  /** `${provider}/${model}` — stable id. */
  id: string
  provider: string
  model: string
  messages: number
  outputTokens: number
  inputTokens: number
  toolCalls: number
  firstSeen: number
  lastSeen: number
  todayOutputTokens: number
  sessions: number
}

/**
 * Aggregate all contributions into the roster. Duplicate replies (same provider:model:start:output, e.g. a
 * forked session copied into another file) are counted once. `dayStart` is the local server midnight used
 * for todayOutputTokens.
 */
export function aggregateRoster(
  contributions: Iterable<Contribution>,
  dayStart: number,
): Map<string, RosterEntry> {
  const seen = new Set<string>()
  const out = new Map<string, RosterEntry>()
  const sessionIds = new Map<string, Set<string>>()

  for (const c of contributions) {
    if (seen.has(c.key)) continue
    seen.add(c.key)

    let entry = out.get(c.modelId)
    if (!entry) {
      entry = {
        id: c.modelId,
        provider: c.provider,
        model: c.model,
        messages: 0,
        outputTokens: 0,
        inputTokens: 0,
        toolCalls: 0,
        firstSeen: c.ts,
        lastSeen: c.ts,
        todayOutputTokens: 0,
        sessions: 0,
      }
      out.set(c.modelId, entry)
      sessionIds.set(c.modelId, new Set())
    }
    entry.messages++
    entry.outputTokens += c.out
    entry.inputTokens += c.inp
    entry.toolCalls += c.tools
    if (c.ts < entry.firstSeen) entry.firstSeen = c.ts
    if (c.ts > entry.lastSeen) entry.lastSeen = c.ts
    if (c.ts >= dayStart) entry.todayOutputTokens += c.out
    if (c.sessionId) sessionIds.get(c.modelId)!.add(c.sessionId)
  }

  for (const [id, entry] of out) entry.sessions = sessionIds.get(id)?.size ?? 0
  return out
}

type KeyRecord = {
  /** Owner (file path) -> compact records carrying this de-dupe key; insertion order picks the canonical one. */
  byOwner: Map<string, CompactContribution[]>
}

/**
 * Incremental lifetime roster: appends are O(new replies) and removing a contribution (truncation/replacement)
 * subtracts exactly what was added. A global de-dupe map holds forked copies of the same reply; only the
 * canonical copy is counted. Bounds and today's total are repaired lazily (day change) or on demand (removal).
 */
export class IncrementalRoster {
  private dayStart: number
  private byId = new Map<string, RosterEntry>()
  /** Distinct session ids among the de-duplicated replies, with reference counts. */
  private sessionRefs = new Map<string, Map<string, number>>()
  private keys = new Map<string, KeyRecord>()
  private dirtyBounds = new Set<string>()

  constructor(dayStart: number) {
    this.dayStart = dayStart
  }

  size(): number {
    return this.byId.size
  }

  /** Add one reply; `owner` identifies the file it came from so a reset can remove it later. */
  add(c: CompactContribution, owner: string): void {
    let record = this.keys.get(c.key)
    if (!record) {
      record = { byOwner: new Map() }
      this.keys.set(c.key, record)
    }
    let list = record.byOwner.get(owner)
    if (!list) {
      list = []
      record.byOwner.set(owner, list)
    }
    const wasEmpty = this.canonical(record) === undefined
    list.push(c)
    if (wasEmpty) this.apply(c, 1)
  }

  /** Subtract one reply previously added from `owner` (no-op when it is no longer present). */
  remove(c: CompactContribution, owner: string): void {
    const record = this.keys.get(c.key)
    if (!record) return
    const list = record.byOwner.get(owner)
    if (!list) return
    const index = list.indexOf(c)
    if (index < 0) return
    const wasCanonical = this.canonical(record) === c
    list.splice(index, 1)
    if (list.length === 0) record.byOwner.delete(owner)
    if (wasCanonical) {
      this.apply(c, -1)
      const next = this.canonical(record)
      if (next) this.apply(next, 1)
    }
    if (record.byOwner.size === 0) this.keys.delete(c.key)
  }

  /** Switch the local day used for todayOutputTokens, recomputing only that field from compact records. */
  setDay(dayStart: number): void {
    if (this.dayStart === dayStart) return
    this.dayStart = dayStart
    for (const entry of this.byId.values()) entry.todayOutputTokens = 0
    for (const record of this.keys.values()) {
      const c = this.canonical(record)
      if (!c || c.ts < dayStart) continue
      const entry = this.byId.get(c.charId)
      if (entry) entry.todayOutputTokens += c.out
    }
  }

  entries(): Iterable<RosterEntry> {
    for (const id of this.dirtyBounds) this.recomputeBounds(id)
    this.dirtyBounds.clear()
    return this.byId.values()
  }

  private canonical(record: KeyRecord): CompactContribution | undefined {
    for (const list of record.byOwner.values()) {
      if (list.length > 0) return list[0]
    }
    return undefined
  }

  private apply(c: CompactContribution, sign: 1 | -1): void {
    let entry = this.byId.get(c.charId)
    if (sign > 0) {
      if (!entry) {
        entry = {
          id: c.charId,
          provider: c.charId.slice(0, c.charId.indexOf('/')),
          model: c.charId.slice(c.charId.indexOf('/') + 1),
          messages: 0,
          outputTokens: 0,
          inputTokens: 0,
          toolCalls: 0,
          firstSeen: c.ts,
          lastSeen: c.ts,
          todayOutputTokens: 0,
          sessions: 0,
        }
        this.byId.set(c.charId, entry)
        this.sessionRefs.set(c.charId, new Map())
      }
      if (entry.messages === 0) {
        entry.firstSeen = c.ts
        entry.lastSeen = c.ts
      } else {
        if (c.ts < entry.firstSeen) entry.firstSeen = c.ts
        if (c.ts > entry.lastSeen) entry.lastSeen = c.ts
      }
      entry.messages++
      entry.outputTokens += c.out
      entry.inputTokens += c.inp
      entry.toolCalls += c.tools
      if (c.ts >= this.dayStart) entry.todayOutputTokens += c.out
      if (c.sessionId) {
        const refs = this.sessionRefs.get(c.charId)!
        refs.set(c.sessionId, (refs.get(c.sessionId) ?? 0) + 1)
        entry.sessions = refs.size
      }
      return
    }

    if (!entry) return
    const wasFirst = c.ts === entry.firstSeen
    const wasLast = c.ts === entry.lastSeen
    entry.messages--
    entry.outputTokens -= c.out
    entry.inputTokens -= c.inp
    entry.toolCalls -= c.tools
    if (c.ts >= this.dayStart) entry.todayOutputTokens -= c.out
    if (c.sessionId) {
      const sessionRefs = this.sessionRefs.get(c.charId)!
      const refs = (sessionRefs.get(c.sessionId) ?? 0) - 1
      if (refs > 0) sessionRefs.set(c.sessionId, refs)
      else sessionRefs.delete(c.sessionId)
      entry.sessions = sessionRefs.size
    }
    if (entry.messages <= 0) {
      this.byId.delete(c.charId)
      this.sessionRefs.delete(c.charId)
      this.dirtyBounds.delete(c.charId)
      return
    }
    if (wasFirst || wasLast) this.dirtyBounds.add(c.charId)
  }

  private recomputeBounds(charId: string): void {
    const entry = this.byId.get(charId)
    if (!entry) return
    let first = Number.POSITIVE_INFINITY
    let last = Number.NEGATIVE_INFINITY
    for (const record of this.keys.values()) {
      const c = this.canonical(record)
      if (!c || c.charId !== charId) continue
      if (c.ts < first) first = c.ts
      if (c.ts > last) last = c.ts
    }
    if (Number.isFinite(first)) entry.firstSeen = first
    if (Number.isFinite(last)) entry.lastSeen = last
  }
}
