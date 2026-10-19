import assert from 'node:assert/strict'
import test from 'node:test'
import { PLANT_SPECS, PLANTS } from '../footprints.ts'
import { ROUTING_ITEMS } from '../routing-obstacles.ts'

test('only lounge and bookshelf plants remain in art and routing', () => {
  assert.deepEqual(PLANT_SPECS.map(spec => spec.seed), [1, 3])
  assert.equal(PLANTS.length, 2)
  assert.equal(ROUTING_ITEMS.filter(item => item.key.startsWith('plant-')).length, 2)
  for (const point of [{ gx: 0.55, gy: 6.35 }, { gx: 7.78, gy: 9.22 }]) {
    assert.ok(!PLANTS.some(box => point.gx >= box.gx && point.gx <= box.gx + box.w && point.gy >= box.gy && point.gy <= box.gy + box.d))
  }
})
