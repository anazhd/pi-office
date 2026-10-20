/**
 * Four seasons, no holidays. The season follows the viewer's local calendar (meteorological
 * seasons, northern hemisphere): Dec-Feb winter, Mar-May spring, Jun-Aug summer, Sep-Nov autumn.
 * The sky already follows the local clock, so the floor does too. Nothing festive is drawn here;
 * a holiday overlay, if it is ever asked for, is a dated overlay on top of a season, not a fifth
 * season.
 */

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

export const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn']

/** Meteorological season for a date's local month. */
export function seasonForDate(date: Date): Season {
  const month = date.getMonth() // 0 = January, in the runtime's local time zone
  if (month === 11 || month <= 1) return 'winter'
  if (month <= 4) return 'spring'
  if (month <= 7) return 'summer'
  return 'autumn'
}

/** Accepts a URL/env value: string or string[] (take the first), trimmed, case-insensitive. */
export function parseSeason(value: unknown): Season | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  if (key === 'fall') return 'autumn'
  return (SEASONS as readonly string[]).includes(key) ? (key as Season) : null
}

/** An explicit override wins; otherwise the calendar decides. */
export function resolveSeason(now: number, override?: Season | null): Season {
  return override ?? seasonForDate(new Date(now))
}

/** What falls (or drifts) outside the windows. */
export type OutsideKind = 'snow' | 'leaf' | 'petal' | 'mote' | 'firefly'

export type SeasonLook = {
  /** Day sky gradient. Dawn, dusk and night keep their shared palette. */
  daySky: { top: string; mid: string; bottom: string }
  /** Window light pool on the floor during the day. */
  pool: { color: string; opacity: number }
  /** Multiplier on the three warm interior ellipses. */
  warmth: number
  /** Barely-there tint over the wood floor; sprites keep their true colours. */
  floorTint: { color: string; opacity: number }
  outsideDay: OutsideKind
  outsideNight: OutsideKind | null
  trees: 'bare' | 'blossom' | 'full' | 'turning'
  roofSnow: boolean
  frost: boolean
  decor: 'pine' | 'planter' | 'hat' | 'leaves'
}

export const SEASON_LOOKS: Record<Season, SeasonLook> = {
  winter: {
    daySky: { top: '#9FB9C9', mid: '#C9D9E0', bottom: '#EEF2F2' },
    pool: { color: '#E3EEF6', opacity: 0.075 },
    warmth: 1.25,
    floorTint: { color: '#BFD3E6', opacity: 0.03 },
    outsideDay: 'snow',
    outsideNight: 'snow',
    trees: 'bare',
    roofSnow: true,
    frost: true,
    decor: 'pine',
  },
  spring: {
    daySky: { top: '#93C6D8', mid: '#C3E1E0', bottom: '#F1F3DC' },
    pool: { color: '#F4F0D6', opacity: 0.07 },
    warmth: 1,
    floorTint: { color: '#D9EFC9', opacity: 0.02 },
    outsideDay: 'petal',
    outsideNight: null,
    trees: 'blossom',
    roofSnow: false,
    frost: false,
    decor: 'planter',
  },
  summer: {
    daySky: { top: '#7DBEDD', mid: '#B0DCE8', bottom: '#F4EFC9' },
    pool: { color: '#FBE2A0', opacity: 0.095 },
    warmth: 0.85,
    floorTint: { color: '#FCE6B0', opacity: 0.025 },
    outsideDay: 'mote',
    outsideNight: 'firefly',
    trees: 'full',
    roofSnow: false,
    frost: false,
    decor: 'hat',
  },
  autumn: {
    daySky: { top: '#8FB3C4', mid: '#D3CDBE', bottom: '#F2DDBA' },
    pool: { color: '#F3C890', opacity: 0.08 },
    warmth: 1.15,
    floorTint: { color: '#E9B77A', opacity: 0.03 },
    outsideDay: 'leaf',
    outsideNight: 'leaf',
    trees: 'turning',
    roofSnow: false,
    frost: false,
    decor: 'leaves',
  },
}
