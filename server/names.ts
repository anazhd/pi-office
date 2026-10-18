// Pure display-name resolution. The JSON stores are read elsewhere (sessions.ts); this module only looks at
// already-parsed data, so it is trivially unit testable.

export type NameResolver = (provider: string, model: string) => string

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

const NAME_INDEX_KEY = '\u0000'

type ModelsArray = { id: string; name: string }[]

/** Collect `provider -> id -> name` from a parsed models-store.json / models.json (shape-tolerant). */
function collect(source: unknown, into: Map<string, string>): void {
  if (!source || typeof source !== 'object') return
  const root = source as Record<string, any>
  // models.json: { providers: { <provider>: { models: [...] } } }
  // models-store.json: { <provider>: { models: [...] } }
  const providers =
    root.providers && typeof root.providers === 'object'
      ? (root.providers as Record<string, any>)
      : root

  for (const [provider, value] of Object.entries(providers)) {
    if (!value || typeof value !== 'object') continue
    const models = (value as { models?: unknown }).models
    if (!Array.isArray(models)) continue
    for (const m of models as ModelsArray) {
      if (!m || typeof m !== 'object') continue
      const id = str((m as any).id)
      const name = str((m as any).name)
      if (!id || !name) continue
      const key = provider + NAME_INDEX_KEY + id
      if (!into.has(key)) into.set(key, name) // earliest source wins
      // Unqualified fallback key (provider unknown / id written differently in the log).
      const bare = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id
      if (!into.has(NAME_INDEX_KEY + bare)) into.set(NAME_INDEX_KEY + bare, name)
    }
  }
}

/** Build a resolver from any number of parsed model stores (earlier sources win; later ones fill gaps). */
export function createNameResolver(sources: unknown[]): NameResolver {
  const index = new Map<string, string>()
  for (const source of sources) collect(source, index)
  return (provider, model) => {
    return (
      index.get(provider + NAME_INDEX_KEY + model) ??
      index.get(NAME_INDEX_KEY + model) ??
      heuristicName(model)
    )
  }
}

/** Strip a vendor prefix (`deepseek/`) and a trailing date/numeric build suffix (`-1017`, `-20251001`). */
function baseModel(model: string): string {
  const trimmed = model.trim()
  const slash = trimmed.lastIndexOf('/')
  const bare = slash >= 0 ? trimmed.slice(slash + 1) : trimmed
  return bare.replace(/[-_]\d{4,}$/, '')
}

const BRAND_SPELLING: Record<string, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  chatgpt: 'ChatGPT',
  qwen: 'Qwen',
}

const titleToken = (t: string): string => {
  if (!t) return t
  const brand = BRAND_SPELLING[t.toLowerCase()]
  if (brand) return brand
  if (/^v\d/i.test(t)) return 'V' + t.slice(1) // v4.1 -> V4.1
  const upper = t.toUpperCase()
  if (upper === 'GPT' || upper === 'API' || upper === 'AI') return upper
  return t[0].toUpperCase() + t.slice(1)
}

/**
 * Heuristic fallback when the model stores have no entry:
 *   claude-opus-5-5          -> Opus 5.5
 *   gpt-6.1-sol              -> GPT-6.1 Sol
 *   deepseek-v4.1-flash-1017 -> DeepSeek V4.1 Flash
 */
export function heuristicName(model: string): string {
  const base = baseModel(model)
  if (!base) return model
  const tokens = base.split(/[-_]+/).filter(Boolean)
  if (tokens.length === 0) return model

  // Claude: family name first, trailing numeric parts joined as a version ("Opus 5.5").
  if (tokens[0].toLowerCase() === 'claude' && tokens.length > 1) {
    const family = titleToken(tokens[1])
    const rest = tokens.slice(2)
    if (rest.every((t) => /^\d+$/.test(t))) return [family, rest.join('.')].filter(Boolean).join(' ')
    return [family, ...rest.map(titleToken)].join(' ')
  }

  // GPT: keep the vendor spelling and hyphen ("GPT-6.1 Sol").
  if (tokens[0].toLowerCase() === 'gpt') {
    return 'GPT-' + tokens.slice(1).map(titleToken).join(' ')
  }

  return tokens.map(titleToken).join(' ')
}
