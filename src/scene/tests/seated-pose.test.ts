import assert from 'node:assert/strict'
import test from 'node:test'
import { LOUNGE_SEATS } from '../layout.ts'
import { seatedPose } from '../seated-pose.ts'

for (const seat of LOUNGE_SEATS) {
  test(`${seat.id} ${seat.kind}: hip contact and connected compact anatomy`, () => {
    const p = seatedPose(seat)
    assert.equal(p.hip.y, -p.height)
    for (const leg of p.legs) {
      assert.ok(Math.hypot(leg.knee.x - leg.hip.x, leg.knee.y - leg.hip.y) < 24)
      if (p.folded) {
        assert.ok(Math.abs(leg.ankle.z - p.height) <= 1)
        assert.ok(Math.hypot(leg.ankle.x, leg.ankle.y + p.height) < 16)
      } else {
        assert.equal(leg.ankle.z, 3)
        assert.equal(leg.toe.z, 2)
        assert.ok(leg.knee.z > leg.ankle.z + 10)
        assert.ok(Math.abs(leg.knee.x - leg.hip.x) > 8)
        assert.ok(Math.abs(leg.ankle.x - leg.knee.x) < 2)
      }
    }
    assert.equal(p.back, p.point(1, 0, 0).y < 0)
    assert.equal(p.mirror, Math.sign(p.point(1, 0, 0).x))
  })
}
