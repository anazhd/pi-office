/**
 * Dated festive overlays. A festive layer is NOT a season: the season keeps following the
 * calendar exactly as before, and a festive layer is a separate, dated dressing drawn on top of
 * whatever season it happens to be. Only one overlay exists so far: Halloween.
 *
 * The window is read from the viewer's local month and day only (never millisecond arithmetic),
 * so leap years, DST and time zones cannot shift it. Inclusive on both ends.
 */

export type Festive = 'halloween'

/** A preview/URL value: a festive layer, explicitly nothing, or "let the calendar decide". */
export type FestiveOverride = Festive | 'none' | 'auto'

export const FESTIVE_KINDS: readonly Festive[] = ['halloween']

/** Local calendar window, 1-based months, inclusive, no year wrap. */
export const HALLOWEEN_WINDOW = { start: { month: 10, day: 17 }, end: { month: 11, day: 7 } } as const

/** Comparable key for a month/day pair: 1017, 1107, ... */
function dayKey(month: number, day: number): number {
  return month * 100 + day
}

const HALLOWEEN_FROM = dayKey(HALLOWEEN_WINDOW.start.month, HALLOWEEN_WINDOW.start.day)
const HALLOWEEN_TO = dayKey(HALLOWEEN_WINDOW.end.month, HALLOWEEN_WINDOW.end.day)

/** The festive layer for a local calendar day, or null. */
export function festiveForLocalDay(month: number, day: number): Festive | null {
  const key = dayKey(month, day)
  return key >= HALLOWEEN_FROM && key <= HALLOWEEN_TO ? 'halloween' : null
}

/** The festive layer for a date's local day (October 17 to November 7, inclusive). */
export function festiveForDate(date: Date): Festive | null {
  return festiveForLocalDay(date.getMonth() + 1, date.getDate())
}

/** Accepts a URL/env value: string or string[] (take the first), trimmed, case-insensitive. */
export function parseFestive(value: unknown): FestiveOverride | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  if (key === 'none' || key === 'off') return 'none'
  if (key === 'auto') return 'auto'
  return (FESTIVE_KINDS as readonly string[]).includes(key) ? (key as Festive) : null
}

/** An explicit override wins; otherwise the local calendar decides. */
export function resolveFestive(now: number, override?: FestiveOverride | null): Festive | null {
  if (override === 'none') return null
  if (override === 'halloween') return 'halloween'
  return festiveForDate(new Date(now))
}
