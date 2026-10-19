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

test('south lounge seats look inward, windows have room and window views', () => {
  for (const id of ['l6', 'l7', 'l13', 'l15', 'l16']) assert.equal(LOUNGE_FACING[id], 'north')
  assert.equal(LOUNGE_FACING.l10, 'south')
  assert.equal(LOUNGE_FACING.l11, 'north')
})
