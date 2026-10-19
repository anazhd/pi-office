import { heuristicName } from '../../server/names.ts'

type Identity = { id: string; provider: string; model: string; displayName: string }

function compact(char: Identity): string {
  const bare = char.model.split('/').at(-1) ?? char.model
  let name = char.displayName.trim() || heuristicName(bare)
  // Stored names occasionally spell dotted Gemini versions as separate numbers.
  name = name.replace(/^(Gemini)\s+(\d+)\s+(\d+)(?=\s|$)/i, '$1 $2.$3')
  if (/^(GPT|Claude|DeepSeek)$/i.test(name)) name = heuristicName(bare)
  return name
    .replace(/^OpenAI\s+/i, '')
    .replace(/^GPT[-\s]+/i, '')
    .replace(/^Claude\s+/i, '')
    .replace(/^DeepSeek[-\s]+/i, 'DS ')
    .replace(/\s+\d{4,}$/, '')
}

/** Scene-only name. Preserve versions/families; disambiguate against the whole roster. */
export function shortTagName(char: Identity, roster: readonly Identity[] = []): string {
  const base = compact(char)
  const peers = roster.filter(other => other.id !== char.id && compact(other) === base)
  if (!peers.length) return base
  const suffix = (c: Identity) => c.displayName.match(/\s(\d{4,})$/)?.[1]
    ?? c.model.match(/[-_](\d{4,})$/)?.[1] ?? c.provider
  if (peers.every(other => suffix(other) !== suffix(char))) return `${base} · ${suffix(char)}`
  const version = (c: Identity) => c.model.match(/\d+(?:[-.]\d+)+/)?.[0]
  if (version(char) && peers.every(other => version(other) !== version(char))) {
    return `${base} · ${version(char)}`
  }
  if (peers.every(other => other.model !== char.model)) return `${base} · ${char.model.split('/').at(-1)}`
  return `${base} · ${char.id}`
}
