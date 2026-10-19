import test from 'node:test'
import assert from 'node:assert/strict'
import { LOUNGE_SEATS } from '../layout.ts'
import { FURNITURE_FOOTPRINTS as F } from '../footprints.ts'
import { seatedPose } from '../seated-pose.ts'
import { furnitureBounds, characterBounds, seatFurnitureKeys, armchairFrontBox } from '../furniture-bounds.ts'
import { sortBackToFront } from '../depth.ts'

for (const [i, box] of [F.armchairNorth, F.armchairSouth].entries()) {
  const seat = LOUNGE_SEATS.find(s => s.id === `l${i + 4}`)!
  test(`${seat.id}: solid near panels follow body; knees and feet exit open west front`, () => {
    const key = `armchair-${i + 1}`
    const panels = [`${key}-front`, `${key}-back`]
    const items = furnitureBounds().map(item => ({ ...item, after: panels.includes(item.key) ? ['occupant'] : [] }))
    const ordered = sortBackToFront([...items, {
      key: 'occupant', bounds: characterBounds({ ...seat, pose: 'idle', deskIndex: null }),
      after: seatFurnitureKeys(seat, null).filter(k => !panels.includes(k)),
    }])
    const at = (k: string) => ordered.findIndex(item => item.key === k)
    assert.ok(at(key) < at('occupant'))
    for (const panel of panels) assert.ok(at('occupant') < at(panel))
    const front = armchairFrontBox(box)
    assert.equal(front.gy + front.d, box.gy + box.d)
    for (const leg of seatedPose(seat).legs) {
      for (const joint of [leg.knee, leg.ankle, leg.toe]) {
        const localY = joint.y + joint.z
        const gx = seat.gx + (joint.x / 32 + localY / 16) / 2
        const gy = seat.gy + (localY / 16 - joint.x / 32) / 2
        assert.ok(gx < box.gx, 'joint clears west opening')
        assert.ok(gy > box.gy + 0.15 && gy < front.gy, 'leg stays between side arms')
      }
    }
  })
}
