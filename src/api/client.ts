import type { OfficeSnapshot } from './types'

/** Same origin on web; point a native build at the office host with EXPO_PUBLIC_OFFICE_API. */
export const API_BASE = (process.env.EXPO_PUBLIC_OFFICE_API ?? '').replace(/\/$/, '')
export const USE_MOCK = process.env.EXPO_PUBLIC_OFFICE_MOCK === '1'

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

export async function fetchOffice(signal?: AbortSignal): Promise<OfficeSnapshot> {
  if (USE_MOCK) {
    const { nextMockSnapshot } = await import('./mock')
    return nextMockSnapshot()
  }

  const res = await fetch(apiUrl('/api/office'), {
    signal,
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Office API returned ${res.status}`)
  return (await res.json()) as OfficeSnapshot
}

export function parseSnapshot(data: string): OfficeSnapshot | null {
  try {
    const parsed = JSON.parse(data) as OfficeSnapshot
    if (!parsed || !Array.isArray(parsed.characters)) return null
    return parsed
  } catch {
    return null
  }
}
