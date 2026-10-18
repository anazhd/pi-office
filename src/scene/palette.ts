import type { Character } from '@/api/types'
import { hashIndex } from './iso'

export const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#D97757',
  openai: '#10A37F',
  'openai-codex': '#10A37F',
  deepseek: '#4D6BFE',
  google: '#4285F4',
  xai: '#2C2926',
  mistral: '#F1A33C',
  meta: '#6D8CF5',
}

const FALLBACK_HUES = [18, 42, 88, 158, 198, 228, 286, 332]

export function providerColor(provider: string, model = ''): string {
  const key = provider.toLowerCase()
  if (key === 'openrouter' && /deepseek/i.test(model)) return '#4D6BFE'
  if (PROVIDER_COLORS[key]) return PROVIDER_COLORS[key]
  const hue = FALLBACK_HUES[hashIndex(key, 3, FALLBACK_HUES.length)]
  return hsl(hue, 42, 52)
}

export function hsl(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

export function shade(hex: string, amount: number): string {
  if (!hex.startsWith('#')) return hex
  const value = hex.slice(1)
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const n = Number.parseInt(full, 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount))
  const b = Math.max(0, Math.min(255, (n & 255) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export const SKIN_TONES = ['#F2C9A0', '#E7B286', '#D79B70', '#BC7E55', '#9A623F', '#F6D8B8']
export const HAIR_TONES = ['#2B211C', '#443028', '#6B4630', '#A45C36', '#C9B7A2', '#3A3F55', '#1E1B1A']
export const PANTS_TONES = ['#3E4759', '#34302B', '#4F5648', '#2E3A44', '#5A4638', '#3B3345']
export const MUG_TONES = ['#F3E6D2', '#E9A94C', '#63B9A8', '#D97757', '#8FA3B8']

export type Look = {
  shirt: string
  shirtDark: string
  /** Back of the shirt: a touch darker, since a back view is turned away from the light. */
  shirtBack: string
  skin: string
  hair: string
  pants: string
  mug: string
  hairStyle: number
  accessory: number
  loungeProp: number
}

export function lookFor(character: Character): Look {
  const id = character.id
  const shirt = providerColor(character.provider, character.model)
  return {
    shirt,
    shirtDark: shade(shirt, -34),
    shirtBack: shade(shirt, -14),
    skin: SKIN_TONES[hashIndex(id, 1, SKIN_TONES.length)],
    hair: HAIR_TONES[hashIndex(id, 2, HAIR_TONES.length)],
    pants: PANTS_TONES[hashIndex(id, 3, PANTS_TONES.length)],
    mug: MUG_TONES[hashIndex(id, 4, MUG_TONES.length)],
    hairStyle: hashIndex(id, 5, 7),
    accessory: hashIndex(id, 6, 5),
    loungeProp: hashIndex(id, 7, 4),
  }
}

export function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    'openai-codex': 'OpenAI Codex',
    deepseek: 'DeepSeek',
    google: 'Google',
    xai: 'xAI',
    mistral: 'Mistral',
    meta: 'Meta',
    openrouter: 'OpenRouter',
  }
  return labels[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1)
}
