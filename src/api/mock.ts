import type { ActiveSession, ActivityStatus, Character, OfficeSnapshot } from './types'

const MIN = 60_000
const DAY = 86_400_000

type Meta = {
  provider: string
  model: string
  displayName: string
  messages: number
  outputTokens: number
  inputTokens: number
  toolCalls: number
  sessions: number
  todayOutputTokens: number
  firstSeenDays: number
}

const ROSTER: Meta[] = [
  {
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    displayName: 'Opus 5.5',
    messages: 4210,
    outputTokens: 1_180_000,
    inputTokens: 28_400_000,
    toolCalls: 980,
    sessions: 64,
    todayOutputTokens: 84_200,
    firstSeenDays: 214,
  },
  {
    provider: 'openai',
    model: 'gpt-6.1-sol',
    displayName: 'GPT-6.1 Sol',
    messages: 3120,
    outputTokens: 742_000,
    inputTokens: 17_800_000,
    toolCalls: 720,
    sessions: 38,
    todayOutputTokens: 52_400,
    firstSeenDays: 188,
  },
  {
    provider: 'openai-codex',
    model: 'gpt-5.3-codex',
    displayName: 'GPT-5.3 Codex',
    messages: 2460,
    outputTokens: 526_000,
    inputTokens: 12_100_000,
    toolCalls: 1130,
    sessions: 41,
    todayOutputTokens: 66_800,
    firstSeenDays: 96,
  },
  {
    provider: 'google',
    model: 'gemini-3.1-pro',
    displayName: 'Gemini 3.1 Pro',
    messages: 1910,
    outputTokens: 384_000,
    inputTokens: 9_600_000,
    toolCalls: 430,
    sessions: 27,
    todayOutputTokens: 31_600,
    firstSeenDays: 173,
  },
  {
    provider: 'deepseek',
    model: 'deepseek-v4.1-flash',
    displayName: 'DeepSeek V4.1 Flash',
    messages: 1320,
    outputTokens: 163_000,
    inputTokens: 5_400_000,
    toolCalls: 310,
    sessions: 23,
    todayOutputTokens: 18_400,
    firstSeenDays: 142,
  },
  {
    provider: 'openrouter',
    model: 'deepseek/deepseek-r1',
    displayName: 'DeepSeek R1',
    messages: 1104,
    outputTokens: 312_000,
    inputTokens: 8_900_000,
    toolCalls: 190,
    sessions: 19,
    todayOutputTokens: 4_100,
    firstSeenDays: 121,
  },
  {
    provider: 'xai',
    model: 'grok-5',
    displayName: 'Grok 5',
    messages: 1530,
    outputTokens: 214_000,
    inputTokens: 6_300_000,
    toolCalls: 480,
    sessions: 20,
    todayOutputTokens: 9_900,
    firstSeenDays: 87,
  },
  {
    provider: 'openrouter',
    model: 'qwen/qwen3.5-coder',
    displayName: 'Qwen3.5 Coder',
    messages: 820,
    outputTokens: 92_400,
    inputTokens: 3_100_000,
    toolCalls: 260,
    sessions: 14,
    todayOutputTokens: 22_600,
    firstSeenDays: 64,
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    displayName: 'Haiku 4.5',
    messages: 640,
    outputTokens: 61_200,
    inputTokens: 2_400_000,
    toolCalls: 140,
    sessions: 12,
    todayOutputTokens: 11_300,
    firstSeenDays: 51,
  },
  {
    provider: 'mistral',
    model: 'mistral-large-3',
    displayName: 'Mistral Large 3',
    messages: 284,
    outputTokens: 22_100,
    inputTokens: 810_000,
    toolCalls: 66,
    sessions: 8,
    todayOutputTokens: 0,
    firstSeenDays: 34,
  },
  {
    provider: 'google',
    model: 'gemini-3.1-flash',
    displayName: 'Gemini 3.1 Flash',
    messages: 192,
    outputTokens: 8_400,
    inputTokens: 402_000,
    toolCalls: 31,
    sessions: 6,
    todayOutputTokens: 2_300,
    firstSeenDays: 19,
  },
  {
    provider: 'meta',
    model: 'llama-5-70b',
    displayName: 'Llama 5 70B',
    messages: 44,
    outputTokens: 2_100,
    inputTokens: 121_000,
    toolCalls: 7,
    sessions: 2,
    todayOutputTokens: 0,
    firstSeenDays: 4,
  },
]

function levelFor(xp: number): number {
  return Math.floor(Math.sqrt(xp / 2000)) + 1
}

function titleFor(level: number): string {
  if (level <= 2) return 'Intern'
  if (level <= 4) return 'Junior'
  if (level <= 7) return 'Engineer'
  if (level <= 11) return 'Senior'
  if (level <= 16) return 'Staff'
  return 'Principal'
}

function progressFor(xp: number, level: number): number {
  const current = (level - 1) ** 2 * 2000
  const next = level ** 2 * 2000
  if (next <= current) return 0
  return Math.min(1, Math.max(0, (xp - current) / (next - current)))
}

function active(
  key: string,
  project: string,
  status: Exclude<ActivityStatus, 'idle'>,
  tool: string | null,
  now: number,
  minsAgo: number,
): ActiveSession {
  return { key, project, status, tool, since: now - minsAgo * MIN }
}

/** A deliberately lively fixture: four phases so walking, typing and coffee are all visible. */
const PHASES: Array<Record<string, ActiveSession[]>> = [
  {},
  {
    'anthropic/claude-opus-5-5': [active('a1c4', 'pi-office', 'thinking', null, 0, 3)],
    'openai/gpt-6.1-sol': [active('b208', 'pi-stats', 'tool', 'bash', 0, 1)],
    'google/gemini-3.1-pro': [active('c71f', 'web-dashboard', 'tool', 'read', 0, 2)],
    'openai-codex/gpt-5.3-codex': [active('d39e', 'pi-office', 'thinking', null, 0, 4)],
  },
  {
    'anthropic/claude-opus-5-5': [active('a1c4', 'pi-office', 'tool', 'edit', 0, 1)],
    'openai/gpt-6.1-sol': [active('b208', 'pi-stats', 'thinking', null, 0, 2)],
    'google/gemini-3.1-pro': [active('c71f', 'web-dashboard', 'thinking', null, 0, 3)],
    'deepseek/deepseek-v4.1-flash': [active('e5aa', 't3-chat', 'tool', 'write', 0, 1)],
    'xai/grok-5': [active('f0b7', 'research', 'tool', 'web_search', 0, 2)],
    'openai-codex/gpt-5.3-codex': [
      active('d39e', 'pi-office', 'tool', 'mcp__github__create_pull_request', 0, 1),
    ],
  },
  {
    'google/gemini-3.1-pro': [active('c71f', 'web-dashboard', 'tool', 'bash', 0, 1)],
    'deepseek/deepseek-v4.1-flash': [active('e5aa', 't3-chat', 'thinking', null, 0, 3)],
    'xai/grok-5': [active('f0b7', 'research', 'tool', 'edit', 0, 2)],
    'anthropic/claude-haiku-4-5': [active('a88d', 'notes', 'thinking', null, 0, 1)],
    'openrouter/qwen/qwen3.5-coder': [active('9c31', 'qwen-playground', 'tool', 'write', 0, 2)],
    'openrouter/deepseek/deepseek-r1': [active('7d12', 't3-chat', 'thinking', null, 0, 5)],
  },
  // Crowd: every roster model is working at once. Exceeds the 10 desks of the original
  // layout, so this exercises the overflow bench and the standing spots.
  {
    'anthropic/claude-opus-5-5': [active('a1c4', 'pi-office', 'tool', 'edit', 0, 1)],
    'openai/gpt-6.1-sol': [active('b208', 'pi-stats', 'thinking', null, 0, 2)],
    'openai-codex/gpt-5.3-codex': [active('d39e', 'pi-office', 'tool', 'bash', 0, 1)],
    'google/gemini-3.1-pro': [active('c71f', 'web-dashboard', 'thinking', null, 0, 3)],
    'deepseek/deepseek-v4.1-flash': [active('e5aa', 't3-chat', 'tool', 'write', 0, 1)],
    'openrouter/deepseek/deepseek-r1': [active('7d12', 't3-chat', 'thinking', null, 0, 5)],
    'xai/grok-5': [active('f0b7', 'research', 'tool', 'web_search', 0, 2)],
    'openrouter/qwen/qwen3.5-coder': [active('9c31', 'qwen-playground', 'tool', 'read', 0, 2)],
    'anthropic/claude-haiku-4-5': [active('a88d', 'notes', 'thinking', null, 0, 1)],
    'mistral/mistral-large-3': [active('6e0c', 'pi-stats', 'tool', 'grep', 0, 2)],
    'google/gemini-3.1-flash': [active('3f9a', 'web-dashboard', 'tool', 'fetch_content', 0, 1)],
    'meta/llama-5-70b': [active('8b47', 'scratch', 'thinking', null, 0, 4)],
  },
]

let phase = 0

export function nextMockSnapshot(): OfficeSnapshot {
  const now = Date.now()
  const actives = PHASES[phase % PHASES.length]
  phase = (phase + 1) % PHASES.length

  const characters: Character[] = ROSTER.map((meta, index) => {
    const id = `${meta.provider}/${meta.model}`
    const sessions = actives[id] ?? []
    const level = levelFor(meta.outputTokens)
    const status: ActivityStatus = sessions.some((s) => s.status === 'tool')
      ? 'tool'
      : sessions.some((s) => s.status === 'thinking')
        ? 'thinking'
        : 'idle'

    return {
      id,
      provider: meta.provider,
      model: meta.model,
      displayName: meta.displayName,
      stats: {
        messages: meta.messages,
        outputTokens: meta.outputTokens,
        inputTokens: meta.inputTokens,
        toolCalls: meta.toolCalls,
        sessions: meta.sessions,
        todayOutputTokens: meta.todayOutputTokens,
        firstSeen: now - meta.firstSeenDays * DAY - index * 3_600_000,
        lastSeen: sessions.length ? now - 20_000 : now - (index + 1) * 42 * MIN,
      },
      level,
      title: titleFor(level),
      xp: meta.outputTokens,
      levelProgress: progressFor(meta.outputTokens, level),
      status,
      active: sessions.map((s) => ({ ...s, since: now - 90_000 - (index + 1) * 5_000 })),
    }
  })

  return {
    now,
    characters,
    totals: {
      activeSessions: characters.reduce((n, c) => n + c.active.length, 0),
      workingCharacters: characters.filter((c) => c.status !== 'idle').length,
      todayOutputTokens: characters.reduce((n, c) => n + c.stats.todayOutputTokens, 0),
      lifetimeOutputTokens: characters.reduce((n, c) => n + c.stats.outputTokens, 0),
    },
  }
}
