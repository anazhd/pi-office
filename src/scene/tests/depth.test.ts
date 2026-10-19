import test from 'node:test'
import assert from 'node:assert/strict'
import { columnAt, sortBackToFront, orderViolations } from '../depth.ts'
import { furnitureBounds, characterBounds, seatFurnitureKeys } from '../furniture-bounds.ts'
import { DESK_SEATS, DESK_CAPACITY } from '../layout.ts'
import { SOFA } from '../footprints.ts'

test('two benches have ten desks; the retired third row has no footprints', () => {
  assert.equal(DESK_CAPACITY, 10)
  assert.deepEqual(DESK_SEATS.map(s => s.id), Array.from({length:10}, (_,i) => `d${i+1}`))
})

test('walker is occluded behind a sofa slice, and covers it in front', () => {
  const sofa = furnitureBounds().find(s => s.key === 'sofa-1')!
  for (const [gx, before] of [[SOFA.gx - 0.3, true], [SOFA.gx + SOFA.w + 0.3, false]] as const) {
    const walker = { key:'walker', bounds:columnAt(gx, SOFA.gy + SOFA.d/2, 0, 64) }
    const sorted = sortBackToFront([sofa, walker])
    assert.equal(sorted[0].key === 'walker', before)
  }
})

test('sample scene obeys every iso constraint; desk worker follows bench and monitor, precedes next row chair', () => {
  const chars = DESK_SEATS.map((seat, i) => ({
    key:`worker-${i}`,
    bounds:characterBounds({...seat, pose:'typing', deskIndex:i}),
    after:seatFurnitureKeys(seat, i),
  }))
  const ordered = sortBackToFront([...furnitureBounds(), ...chars])
  assert.deepEqual(orderViolations(ordered), [])
  const at = (key:string) => ordered.findIndex(s => s.key === key)
  for (let i=0;i<10;i++) {
    assert.ok(at(`bench-${i<5?0:1}`) < at(`worker-${i}`))
    assert.ok(at(`monitor-${i}`) < at(`worker-${i}`))
    if(i<5) assert.ok(at(`worker-${i}`) < at(`chair-${i+5}`))
  }
})
