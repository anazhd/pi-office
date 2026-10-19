import test from 'node:test'
import assert from 'node:assert/strict'
import { LOUNGE_SEATS } from '../layout.ts'
import { FURNITURE_FOOTPRINTS as F } from '../footprints.ts'
import { seatedPose } from '../seated-pose.ts'
import { furnitureBounds, characterBounds, seatFurnitureKeys, armchairFrontBox, armchairForegroundKeys } from '../furniture-bounds.ts'
import { sortBackToFront } from '../depth.ts'

for (const [i, box] of [F.armchairNorth, F.armchairSouth].entries()) {
  const seat = LOUNGE_SEATS.find(s => s.id === `l${i + 4}`)!
  test(`${seat.id}: solid near panels follow body; knees and feet exit open west front`, () => {
    const key = `armchair-${i + 1}`
    const panels = armchairForegroundKeys(seat)
    assert.deepEqual(panels, [`${key}-shell`, `${key}-front`, `${key}-back`])
    const items = furnitureBounds().map(item => ({ ...item, after: panels.includes(item.key) ? ['occupant'] : [] }))
    const ordered = sortBackToFront([...items, {
      key: 'occupant', bounds: characterBounds({ ...seat, pose: 'idle', deskIndex: null }),
      after: seatFurnitureKeys(seat, null).filter(k => !panels.includes(k)),
    }])
    const at = (k: string) => ordered.findIndex(item => item.key === k)
    assert.ok(at(key) < at('occupant'))
    for (const panel of panels) assert.ok(at('occupant') < at(panel))
    // The near ankle projects onto the lower solid side, below the upper arm.
    // Checking only knee/foot world positions misses this view-ray occlusion.
    const nearAnkle = seatedPose(seat).legs.map(leg => leg.ankle).find(joint => {
      const gy = seat.gy + ((joint.y + joint.z) / 16 - joint.x / 32) / 2
      return gy > seat.gy
    })!
    const ankleGx = seat.gx + (nearAnkle.x / 32 + (nearAnkle.y + nearAnkle.z) / 16) / 2
    const ankleGy = seat.gy + ((nearAnkle.y + nearAnkle.z) / 16 - nearAnkle.x / 32) / 2
    const t = box.gy + box.d - ankleGy
    const hitZ = nearAnkle.z + t * 32
    assert.ok(hitZ > 0 && hitZ < 20, 'shoe projects onto lower upholstery, not upper arm')
    assert.ok(ankleGx + t > box.gx && ankleGx + t < box.gx + box.w - 0.12)
    assert.ok(at('occupant') < at(`${key}-shell`), 'lower solid face must hide this shoe pixel')
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
