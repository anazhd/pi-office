import assert from 'node:assert/strict'
import test from 'node:test'
import { LEFT_WINDOWS, RIGHT_WINDOWS, WALL_AXIS, OPS_BOARD, SKY_ORB_WINDOW, rightWallTransform } from '../wall-art.ts'
import { iso } from '../iso.ts'

for (const [wall, windows, length] of [['left', LEFT_WINDOWS, 10], ['right', RIGHT_WINDOWS, 14]] as const) {
  test(`${wall} windows stay inside their wall with an outer pier`, () => {
    for (const window of windows) {
      assert.ok(window.start > 0)
      assert.ok(window.start + window.length < length)
    }
  })
}
test('wall art uses a foreshortened unit axis parallel to its wall, with verticals unchanged', () => {
  assert.ok(Math.abs(Math.hypot(WALL_AXIS.x, WALL_AXIS.y) - 1) < 1e-12)
  assert.equal(WALL_AXIS.y / WALL_AXIS.x, 0.5)
  const p = iso(OPS_BOARD.gx, 0, OPS_BOARD.z)
  assert.equal(rightWallTransform(OPS_BOARD.gx, OPS_BOARD.z), `matrix(${WALL_AXIS.x} ${WALL_AXIS.y} 0 1 ${p.x} ${p.y})`)
  // Bottommost content (indicator) and subtitle are INSIDE the frame, not below it.
  assert.ok(28 + 3 < OPS_BOARD.height / 2)
  assert.ok(26 < OPS_BOARD.width / 2)
})
test('shared sky has exactly one designated sun/moon opening', () => {
  const openings = [...RIGHT_WINDOWS.map((_, index) => ({ wall: 'right', index })), ...LEFT_WINDOWS.map((_, index) => ({ wall: 'left', index }))]
  assert.equal(openings.filter(w => w.wall === SKY_ORB_WINDOW.wall && w.index === SKY_ORB_WINDOW.index).length, 1)
})
