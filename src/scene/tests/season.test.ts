// Seasons are a calendar fact, not a setting: the month of the viewer's local clock decides.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SEASON_LOOKS,
  SEASONS,
  parseSeason,
  resolveSeason,
  seasonForDate,
  type Season,
} from '../season.ts'

const HEX = /^#[0-9A-F]{6}$/i

function local(year: number, month: number, day: number, hour = 12, minute = 0) {
  return new Date(year, month, day, hour, minute)
}

test('seasonForDate: northern meteorological seasons, switching at local midnight', () => {
  const cases: Array<[Date, Season]> = [
    [local(2026, 10, 30, 23, 59), 'autumn'], // Nov 30 23:59
    [local(2026, 11, 1, 0, 0), 'winter'], // Dec 1 00:00
    [local(2027, 0, 15), 'winter'],
    [local(2028, 1, 29), 'winter'], // leap day
    [local(2027, 2, 1), 'spring'],
    [local(2027, 4, 31, 23, 59), 'spring'],
    [local(2027, 5, 1), 'summer'],
    [local(2027, 7, 31, 23, 59), 'summer'],
    [local(2027, 8, 1), 'autumn'],
  ]
  for (const [date, expected] of cases) {
    assert.equal(seasonForDate(date), expected, date.toString())
  }
})

test('every month maps to exactly one season and the four quarters are contiguous', () => {
  const byMonth = Array.from({ length: 12 }, (_, month) => seasonForDate(local(2027, month, 10)))
  assert.deepEqual(byMonth, [
    'winter',
    'winter',
    'spring',
    'spring',
    'spring',
    'summer',
    'summer',
    'summer',
    'autumn',
    'autumn',
    'autumn',
    'winter',
  ])
})

test('parseSeason: trims, lowercases, accepts fall, takes the first array entry, rejects junk', () => {
  assert.equal(parseSeason('Winter'), 'winter')
  assert.equal(parseSeason(' autumn '), 'autumn')
  assert.equal(parseSeason('fall'), 'autumn')
  assert.equal(parseSeason('FALL'), 'autumn')
  assert.equal(parseSeason(['spring']), 'spring')
  assert.equal(parseSeason(['summer', 'winter']), 'summer')
  assert.equal(parseSeason(''), null)
  assert.equal(parseSeason('   '), null)
  assert.equal(parseSeason('xmas'), null)
  assert.equal(parseSeason(undefined), null)
  assert.equal(parseSeason(null), null)
  assert.equal(parseSeason(42), null)
  assert.equal(parseSeason({ season: 'winter' }), null)
})

test('resolveSeason: an explicit override wins, otherwise the calendar decides', () => {
  const january = local(2027, 0, 10).getTime()
  const july = local(2027, 6, 10).getTime()
  assert.equal(resolveSeason(january), 'winter')
  assert.equal(resolveSeason(july), 'summer')
  assert.equal(resolveSeason(january, 'summer'), 'summer')
  assert.equal(resolveSeason(january, null), 'winter')
  assert.equal(resolveSeason(july, undefined), 'summer')
})

test('SEASON_LOOKS covers every season with quiet colours and opacities', () => {
  assert.deepEqual(Object.keys(SEASON_LOOKS).sort(), [...SEASONS].sort())
  for (const season of SEASONS) {
    const look = SEASON_LOOKS[season]
    for (const colour of [look.daySky.top, look.daySky.mid, look.daySky.bottom, look.pool.color, look.floorTint.color]) {
      assert.match(colour, HEX, season + ' colour')
    }
    assert.ok(look.pool.opacity > 0 && look.pool.opacity <= 0.1, season + ' pool')
    assert.ok(look.floorTint.opacity > 0 && look.floorTint.opacity <= 0.03, season + ' floor tint')
    assert.ok(look.warmth > 0.5 && look.warmth < 2, season + ' warmth')
    assert.ok(['bare', 'blossom', 'full', 'turning'].includes(look.trees))
    assert.ok(['pine', 'planter', 'hat', 'leaves'].includes(look.decor))
    assert.ok(['snow', 'leaf', 'petal', 'mote', 'firefly'].includes(look.outsideDay))
    assert.ok(look.outsideNight === null || ['snow', 'leaf', 'petal', 'mote', 'firefly'].includes(look.outsideNight))
  }
  // Only winter has frost and roof snow.
  assert.deepEqual(
    SEASONS.filter((s) => SEASON_LOOKS[s].frost),
    ['winter'],
  )
  assert.deepEqual(
    SEASONS.filter((s) => SEASON_LOOKS[s].roofSnow),
    ['winter'],
  )
})

test('nothing festive is wired in: no bows, baubles, pumpkins, eggs or flags', () => {
  const source = JSON.stringify(Object.values(SEASON_LOOKS))
  for (const word of ['gift', 'santa', 'tree-decor', 'bauble', 'pumpkin', 'egg', 'flag', 'heart', 'bow']) {
    assert.ok(!source.includes(word), word)
  }
})
