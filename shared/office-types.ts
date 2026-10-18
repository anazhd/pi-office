// API contract between server/ and the Expo app. Types only (erasable TS, safe for node type stripping).

export type ActivityStatus = 'idle' | 'thinking' | 'tool'

/** One active Pi session currently driving a character. */
export type ActiveSession = {
  /** Short stable hash of the session id (never the raw path). */
  key: string
  /** basename(cwd), e.g. "pi-office". */
  project: string
  status: Exclude<ActivityStatus, 'idle'>
  /** Tool name when status === 'tool', else null. Name only, never arguments. */
  tool: string | null
  /** Epoch ms of the last line written in that session. */
  since: number
}

export type Character = {
  /** `${provider}/${model}`, stable forever. */
  id: string
  provider: string
  model: string
  /** Human name, e.g. "Opus 5.5". */
  displayName: string
  /** Aggregated over the whole lifetime of ~/.pi sessions. */
  stats: {
    messages: number
    outputTokens: number
    inputTokens: number
    toolCalls: number
    sessions: number
    todayOutputTokens: number
    firstSeen: number
    lastSeen: number
  }
  level: number
  title: string
  xp: number
  /** 0..1 progress to next level. */
  levelProgress: number
  /** 'idle' when no active sessions, otherwise the "busiest" active status (tool > thinking). */
  status: ActivityStatus
  /**
   * Active sessions for this model. `active[0]` is the representative session: the newest `tool` session
   * when `status` is `'tool'`, otherwise the newest thinking session. The rest follow by recency.
   * Empty when idle.
   */
  active: ActiveSession[]
}

export type OfficeSnapshot = {
  /** Server time, epoch ms. */
  now: number
  /** Characters sorted by firstSeen ascending (stable seating order). */
  characters: Character[]
  totals: {
    activeSessions: number
    workingCharacters: number
    todayOutputTokens: number
    lifetimeOutputTokens: number
  }
}
