import assert from 'node:assert/strict'
import test from 'node:test'
import { LOUNGE_FACING, LOUNGE_SEATS, seatedFacing } from '../layout.ts'

test('every fixed lounge seat has an explicit furniture-facing orientation', () => {
  assert.deepEqual(Object.keys(LOUNGE_FACING).sort(), LOUNGE_SEATS.map((s) => s.id).sort())
  for (const seat of LOUNGE_SEATS) assert.equal(seatedFacing(seat), LOUNGE_FACING[seat.id])
})

test('rust armchairs face west and sofa faces east across the table', () => {
  for (const seat of LOUNGE_SEATS.filter((s) => s.kind === 'armchair')) assert.equal(seatedFacing(seat), 'west')
  for (const seat of LOUNGE_SEATS.filter((s) => s.kind === 'sofa')) assert.equal(seatedFacing(seat), 'east')
})

test('floor conversation pairs face each other and BOTH bench occupants face into the room', () => {
  assert.equal(LOUNGE_FACING.l6, 'east')
  assert.equal(LOUNGE_FACING.l7, 'west')
  assert.equal(LOUNGE_FACING.l8, 'east')
  assert.equal(LOUNGE_FACING.l9, 'west')
  assert.equal(LOUNGE_FACING.l10, 'south')
  assert.equal(LOUNGE_FACING.l11, 'south')
})
