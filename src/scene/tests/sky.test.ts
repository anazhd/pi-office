// The sky keeps its shared dawn/dusk/night palette; only the day gradient is seasonal.
import assert from 'node:assert/strict'
import test from 'node:test'
import { SEASONS } from '../season.ts'
import { SKY_HOURS, skyPalette, skyPhase } from '../sky.ts'

function at(hour: number, minute = 0) {
  return new Date(2027, 4, 12, hour, minute).getTime() // May 12, a day in spring
}

test('skyPhase: hour boundaries, unchanged from the original sky', () => {
  assert.equal(skyPhase(at(0)), 'night')
  assert.equal(skyPhase(at(5, 29)), 'night')
  assert.equal(skyPhase(at(5, 30)), 'dawn')
  assert.equal(skyPhase(at(8, 29)), 'dawn')
  assert.equal(skyPhase(at(8, 30)), 'day')
  assert.equal(skyPhase(at(16, 59)), 'day')
  assert.equal(skyPhase(at(17)), 'dusk')
  assert.equal(skyPhase(at(20, 29)), 'dusk')
  assert.equal(skyPhase(at(20, 30)), 'night')
  assert.equal(skyPhase(at(23, 59)), 'night')
  assert.deepEqual(SKY_HOURS, { dawn: 5.5, day: 8.5, dusk: 17, night: 20.5 })
})

test('dawn, dusk and night are identical in every season; only the day sky is seasonal', () => {
  for (const hour of [6, 18, 23]) {
    const first = skyPalette(at(hour), SEASONS[0])
    for (const season of SEASONS.slice(1)) {
      assert.deepEqual(skyPalette(at(hour), season), first, `${season} at ${hour}:00`)
    }
  }
  const daySunsets = SEASONS.map((season) => skyPalette(at(12), season).bottom)
  assert.equal(new Set(daySunsets).size, SEASONS.length, 'each season has its own day gradient')
})

test('the night palette still reports night and keeps the moon colour', () => {
  const night = skyPalette(at(23), 'winter')
  assert.equal(night.night, true)
  assert.equal(night.orb, '#EFE6CF')
  const day = skyPalette(at(12), 'winter')
  assert.equal(day.night, false)
  assert.equal(day.orb, '#F7E3A8')
})
