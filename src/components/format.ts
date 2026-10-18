export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1_000_000_000) return `${trim(value / 1_000_000_000)}B`
  if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`
  if (value >= 10_000) return `${trim(value / 1_000)}k`
  if (value >= 1_000) return `${trim(value / 1_000)}k`
  return `${Math.round(value)}`
}

function trim(value: number): string {
  const fixed = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)
  return fixed.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')
}

export function fullNumber(value: number): string {
  try {
    return new Intl.NumberFormat('en-US').format(value)
  } catch {
    return String(value)
  }
}

export function relativeTime(timestamp: number, now: number): string {
  const diff = Math.max(0, now - timestamp)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

export function dayLabel(timestamp: number, now: number): string {
  const date = new Date(timestamp)
  const current = new Date(now)
  const sameYear = date.getFullYear() === current.getFullYear()
  try {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

export function clockLabel(now: number): string {
  const date = new Date(now)
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

export function sessionAge(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const DARK_TEXT = new Set(['#E9A94C', '#F3C57A', '#C9B08B', '#63B9A8', '#8DA37E', '#D97757'])

export function contrastText(color: string): string {
  if (DARK_TEXT.has(color)) return '#17110B'
  const hex = color.replace('#', '')
  if (hex.length !== 6) return '#F4EDE0'
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.64 ? '#17110B' : '#F4EDE0'
}
