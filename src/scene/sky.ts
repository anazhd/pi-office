import { SEASON_LOOKS, type Season } from './season.ts'

export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night'

/** Local-hour boundaries that split the day; the sky has always used these. */
export const SKY_HOURS = { dawn: 5.5, day: 8.5, dusk: 17, night: 20.5 } as const

function localHour(now: number): number {
  const date = new Date(now)
  return date.getHours() + date.getMinutes() / 60
}

export function skyPhase(now: number): SkyPhase {
  const hour = localHour(now)
  if (hour >= SKY_HOURS.dawn && hour < SKY_HOURS.day) return 'dawn'
  if (hour >= SKY_HOURS.day && hour < SKY_HOURS.dusk) return 'day'
  if (hour >= SKY_HOURS.dusk && hour < SKY_HOURS.night) return 'dusk'
  return 'night'
}

export type SkyPalette = {
  top: string
  mid: string
  bottom: string
  orb: string
  night: boolean
}

/** Dawn, dusk and night are shared by every season; only the day gradient is seasonal. */
export function skyPalette(now: number, season: Season): SkyPalette {
  const phase = skyPhase(now)
  if (phase === 'dawn') {
    return { top: '#3F4C63', mid: '#B98A78', bottom: '#F0C39A', orb: '#F3C57A', night: false }
  }
  if (phase === 'day') {
    const { top, mid, bottom } = SEASON_LOOKS[season].daySky
    return { top, mid, bottom, orb: '#F7E3A8', night: false }
  }
  if (phase === 'dusk') {
    return { top: '#6A5B72', mid: '#C97C63', bottom: '#F2B476', orb: '#F6D08A', night: false }
  }
  return { top: '#101A31', mid: '#1B2743', bottom: '#2B3A56', orb: '#EFE6CF', night: true }
}
