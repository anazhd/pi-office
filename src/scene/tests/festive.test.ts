// A festive overlay is a dated layer, not a season: the local month and day decide, and the
// season is untouched either way.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HALLOWEEN_WINDOW,
  festiveForDate,
  festiveForLocalDay,
  parseFestive,
  resolveFestive,
  type Festive,
  type FestiveOverride,
} from '../festive.ts'
import { SEASON_LOOKS, SEASONS, resolveSeason, seasonForDate } from '../season.ts'

function local(year: number, month: number, day: number, hour = 12, minute = 0, second = 0, ms = 0) {
  return new Date(year, month, day, hour, minute, second, ms)
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

const YEARS = [2024, 2025, 2026, 2027, 2028, 2100]

test('halloween runs from local Oct 17 to local Nov 7 inclusive, in leap and ordinary years', () => {
  for (const year of YEARS) {
    const cases: Array<[Date, Festive | null]> = [
      [local(year, 9, 16, 23, 59, 59, 999), null],
      [local(year, 9, 17, 0, 0), 'halloween'],
      [local(year, 9, 19), 'halloween'],
      [local(year, 9, 31, 23, 59, 59, 999), 'halloween'],
      [local(year, 10, 1, 0, 0), 'halloween'],
      [local(year, 10, 7, 23, 59, 59, 999), 'halloween'],
      [local(year, 10, 8, 0, 0), null],
    ]
    for (const [date, expected] of cases) {
      assert.equal(festiveForDate(date), expected, date.toString())
    }
  }
})

test('no other day of the year turns the overlay on', () => {
  const cases: Date[] = [
    local(2026, 0, 1, 0, 0),
    local(2026, 0, 2),
    local(2026, 1, 14),
    local(2028, 1, 29), // leap day
    local(2026, 3, 1),
    local(2026, 5, 21), // solstice
    local(2026, 7, 15),
    local(2026, 8, 30, 23, 59),
    local(2026, 9, 16, 23, 59, 59, 999),
    local(2026, 10, 8, 0, 0),
    local(2026, 10, 30, 23, 59),
    local(2026, 11, 31, 23, 59, 59, 999),
    local(2026, 11, 31, 23, 59),
  ]
  for (const date of cases) assert.equal(festiveForDate(date), null, date.toString())
})

test('the year turns over without the window leaking into December', () => {
  assert.equal(festiveForDate(local(2026, 11, 31, 23, 59, 59, 999)), null)
  assert.equal(festiveForDate(local(2027, 0, 1, 0, 0)), null)
  assert.equal(festiveForDate(local(2026, 9, 16)), null)
})

test('every day of 2026 and 2028: exactly 22 active days, in one continuous run', () => {
  for (const year of [2026, 2028]) {
    const days = isLeapYear(year) ? 366 : 365
    const active: Date[] = []
    for (let i = 0; i < days; i++) {
      const date = new Date(year, 0, i + 1) // local midnight; Date normalises DST and leap days
      assert.equal(date.getFullYear(), year, 'day ' + (i + 1) + ' stays inside ' + year)
      if (festiveForDate(date) !== null) active.push(date)
    }
    assert.equal(active.length, 22, String(year))
    assert.deepEqual(
      active.map((d) => [d.getMonth() + 1, d.getDate()]),
      Array.from({ length: 22 }, (_, i) => {
        const d = new Date(year, 9, 17 + i)
        return [d.getMonth() + 1, d.getDate()]
      }),
      String(year),
    )
    // Contiguous: no gaps and no second run.
    for (let i = 1; i < active.length; i++) {
      const previous = active[i - 1]
      const current = active[i]
      const next = new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 1)
      assert.equal(next.getDate(), current.getDate(), String(year))
    }
  }
})

test('the window constants are the documented ones and do not wrap the year', () => {
  assert.deepEqual(HALLOWEEN_WINDOW, { start: { month: 10, day: 17 }, end: { month: 11, day: 7 } })
  assert.ok(HALLOWEEN_WINDOW.start.month <= HALLOWEEN_WINDOW.end.month)
  assert.ok(HALLOWEEN_WINDOW.start.day <= 31 && HALLOWEEN_WINDOW.end.day <= 30)
})

test('festiveForLocalDay: 1-based months, inclusive ends', () => {
  assert.equal(festiveForLocalDay(10, 16), null)
  assert.equal(festiveForLocalDay(10, 17), 'halloween')
  assert.equal(festiveForLocalDay(10, 31), 'halloween')
  assert.equal(festiveForLocalDay(11, 1), 'halloween')
  assert.equal(festiveForLocalDay(11, 7), 'halloween')
  assert.equal(festiveForLocalDay(11, 8), null)
  assert.equal(festiveForLocalDay(12, 7), null)
  assert.equal(festiveForLocalDay(0, 0), null)
})

test('parseFestive: trimmed, case-insensitive, arrays take the first value, junk is ignored', () => {
  const cases: Array<[unknown, FestiveOverride | null]> = [
    ['halloween', 'halloween'],
    ['  HALLOWEEN ', 'halloween'],
    ['none', 'none'],
    ['OFF', 'none'],
    ['auto', 'auto'],
    [' Auto', 'auto'],
    [['halloween', 'none'], 'halloween'],
    [['none'], 'none'],
    [['', 'halloween'], null],
    ['', null],
    ['   ', null],
    ['xmas', null],
    ['festive', null],
    [42, null],
    [{}, null],
    [null, null],
    [undefined, null],
    [[], null],
  ]
  for (const [value, expected] of cases) {
    assert.equal(parseFestive(value), expected, JSON.stringify(value) ?? String(value))
  }
})

test('resolveFestive: an explicit override wins, auto and null follow the calendar', () => {
  const oct31 = local(2026, 9, 31, 12).getTime()
  const july4 = local(2026, 6, 4, 12).getTime()
  const oct19 = local(2026, 9, 19, 12).getTime()

  // 'none' hides the overlay even on Halloween itself.
  assert.equal(resolveFestive(oct31, 'none'), null)
  // 'halloween' shows it out of season.
  assert.equal(resolveFestive(july4, 'halloween'), 'halloween')
  // 'auto', null and undefined are the calendar.
  for (const override of ['auto', null, undefined] as const) {
    assert.equal(resolveFestive(oct31, override), 'halloween', String(override))
    assert.equal(resolveFestive(july4, override), null, String(override))
    assert.equal(resolveFestive(oct19, override), 'halloween', String(override))
  }
})

test('preview precedence: a URL value wins, then the env value, then the calendar (auto beats env)', () => {
  // Mirrors OfficeScreen: festiveOverride ?? ENV_FESTIVE, then resolveFestive.
  const preview = (url: unknown, env: unknown, now: number) =>
    resolveFestive(now, parseFestive(url) ?? parseFestive(env))
  const oct31 = local(2026, 9, 31, 12).getTime()
  const july4 = local(2026, 6, 4, 12).getTime()
  const oct19 = local(2026, 9, 19, 12).getTime()

  assert.equal(preview('halloween', 'none', july4), 'halloween', 'URL beats env')
  assert.equal(preview('none', 'halloween', oct31), null, 'URL beats env')
  assert.equal(preview('auto', 'none', oct31), 'halloween', '?festive=auto beats EXPO_PUBLIC_OFFICE_FESTIVE=none')
  assert.equal(preview('auto', 'halloween', july4), null, '?festive=auto beats EXPO_PUBLIC_OFFICE_FESTIVE=halloween')
  assert.equal(preview('xmas', 'none', oct31), null, 'an invalid URL value falls through to env')
  assert.equal(preview('xmas', 'halloween', july4), 'halloween', 'an invalid URL value falls through to env')
  assert.equal(preview(undefined, 'halloween', july4), 'halloween', 'env alone')
  assert.equal(preview(undefined, undefined, oct19), 'halloween', 'calendar alone')
  assert.equal(preview(undefined, undefined, july4), null, 'calendar alone')
})

test('the overlay never changes the season, and the season never changes the overlay', () => {
  const oct19 = local(2026, 9, 19, 12)
  assert.equal(seasonForDate(oct19), 'autumn')
  assert.equal(resolveSeason(oct19.getTime()), 'autumn')
  assert.equal(resolveFestive(oct19.getTime()), 'halloween')

  // An explicit season is still respected while the overlay is up.
  for (const season of SEASONS) {
    assert.equal(resolveSeason(oct19.getTime(), season), season)
    assert.equal(festiveForDate(oct19), 'halloween')
  }
  // ... and an explicit overlay never moves the season, even out of season.
  assert.equal(seasonForDate(local(2026, 6, 4)), 'summer')
  assert.equal(resolveFestive(local(2026, 6, 4).getTime(), 'halloween'), 'halloween')
})

test('season looks are untouched: still four seasons, same decor and weather keys', () => {
  assert.deepEqual(Object.keys(SEASON_LOOKS).sort(), ['autumn', 'spring', 'summer', 'winter'])
  assert.deepEqual([...SEASONS].sort(), ['autumn', 'spring', 'summer', 'winter'])
  const keys = Object.keys(SEASON_LOOKS.winter).sort()
  for (const season of SEASONS) assert.deepEqual(Object.keys(SEASON_LOOKS[season]).sort(), keys)
  assert.deepEqual(keys, [
    'daySky',
    'decor',
    'floorTint',
    'frost',
    'outsideDay',
    'outsideNight',
    'pool',
    'roofSnow',
    'trees',
    'warmth',
  ])
  // No festive concept leaked into the season looks.
  const source = JSON.stringify(Object.values(SEASON_LOOKS))
  for (const word of ['halloween', 'pumpkin', 'bat', 'cobweb', 'festive']) {
    assert.ok(!source.includes(word), word)
  }
})

test('the day this shipped (2026-10-19) shows the overlay with no override at all', () => {
  const now = local(2026, 9, 19, 12, 0).getTime()
  assert.equal(resolveFestive(now), 'halloween')
  assert.equal(resolveSeason(now), 'autumn')
})
