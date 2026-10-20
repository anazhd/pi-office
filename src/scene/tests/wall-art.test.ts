import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HALLOWEEN_ANCHORS,
  LEFT_WINDOWS,
  RIGHT_WINDOWS,
  WALL_AXIS,
  WALL_UNIT_PX,
  OPS_BOARD,
  SEASON_DECOR_ANCHORS,
  SKY_ORB,
  SKY_ORB_NIGHT_RADIUS,
  SKY_ORB_WINDOW,
  skyOrbPoint,
  WINDOW_SILL_Z,
  WINDOW_TOP_Z,
  leftWallTransform,
  rightWallTransform,
  windowGlass,
} from '../wall-art.ts'
import { iso, WALL_H, type ScreenPoint } from '../iso.ts'

/** Applies a matrix(a b c d e f) to a local point, the way the SVG renderer does. */
function applyMatrix(matrix: string, x: number, y: number): ScreenPoint {
  const values = matrix.slice('matrix('.length, -1).split(' ').map(Number)
  const [a, b, c, d, e, f] = values
  return { x: a * x + c * y + e, y: b * x + d * y + f }
}

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


test('windowGlass: the clip polygon is the real pane, and the wall matrix lands on its corners', () => {
  for (const [wall, windows] of [['left', LEFT_WINDOWS], ['right', RIGHT_WINDOWS]] as const) {
    windows.forEach((spec, index) => {
      const glass = windowGlass(wall, spec, index)
      const corner = (along: number, z: number) => (wall === 'right' ? iso(along, 0, z) : iso(0, along, z))
      const topLeft = corner(spec.start, WINDOW_TOP_Z)
      const topRight = corner(spec.start + spec.length, WINDOW_TOP_Z)
      const bottomRight = corner(spec.start + spec.length, WINDOW_SILL_Z)
      const bottomLeft = corner(spec.start, WINDOW_SILL_Z)

      assert.deepEqual(glass.topLeft, topLeft)
      assert.deepEqual(glass.topRight, topRight)
      assert.deepEqual(glass.bottomRight, bottomRight)
      assert.deepEqual(glass.bottomLeft, bottomLeft)
      assert.equal(
        glass.points,
        [topLeft, topRight, bottomRight, bottomLeft].map((p) => `${p.x},${p.y}`).join(' '),
      )

      // Local (0,0) is the top-left of the glass and (width,height) the bottom-right.
      const tl = applyMatrix(glass.transform, 0, 0)
      const br = applyMatrix(glass.transform, glass.width, glass.height)
      for (const [got, want] of [
        [tl, topLeft],
        [br, bottomRight],
      ] as const) {
        assert.ok(Math.abs(got.x - want.x) < 1e-9, `${wall} ${index} x: ${got.x} vs ${want.x}`)
        assert.ok(Math.abs(got.y - want.y) < 1e-9, `${wall} ${index} y: ${got.y} vs ${want.y}`)
      }
      assert.equal(glass.height, WINDOW_TOP_Z - WINDOW_SILL_Z)
    })
  }
})

test('leftWallTransform mirrors the wall axis so local x still runs along the wall', () => {
  const matrix = leftWallTransform(2, 100)
  const p = iso(0, 2, 100)
  assert.equal(matrix, `matrix(${-WALL_AXIS.x} ${WALL_AXIS.y} 0 1 ${p.x} ${p.y})`)
  const along = applyMatrix(matrix, 1, 0)
  assert.ok(Math.abs(along.x - (p.x - WALL_AXIS.x)) < 1e-12)
  assert.ok(Math.abs(along.y - (p.y + WALL_AXIS.y)) < 1e-12)
  // One unused grid pixel down the wall stays exactly one pixel tall.
  const down = applyMatrix(matrix, 0, 1)
  assert.ok(Math.abs(down.x - p.x) < 1e-12 && Math.abs(down.y - (p.y + 1)) < 1e-12)
})

test('season decor hangs beside the back corner, clear of every window and below the top trim', () => {
  const { right, left } = SEASON_DECOR_ANCHORS
  // The pieces are about 22 px wide (0.6 grid units) and reach ~20 px up the wall from their hook.
  assert.ok(right.gx > 0 && right.gx + 0.4 < RIGHT_WINDOWS[0].start, 'right piece sits ahead of the first right window')
  assert.ok(left.gy > 0 && left.gy + 0.4 < LEFT_WINDOWS[0].start, 'left piece sits ahead of the first left window')
  for (const anchor of [right, left]) {
    assert.ok(anchor.z + 10 < WALL_H - 5, 'hangs clear of the wall trim')
    assert.ok(anchor.z - 24 > 0, 'hangs clear of the floor')
  }
})

/* ---------------- Halloween overlay anchors (see festive-layers.tsx) ---------------- */

/** The wall clock the garland must clear: r 17 centred at (gx 7.5, z 118) in backdrop.tsx. */
const WALL_CLOCK = { gx: 7.5, z: 118, radius: 17 }

/** Local (along-the-pane, down-the-pane) coordinates of a screen point inside a pane. */
function paneCoordinates(wall: 'left' | 'right', spec: (typeof RIGHT_WINDOWS)[number], index: number, p: ScreenPoint) {
  const glass = windowGlass(wall, spec, index)
  const u = { x: glass.topRight.x - glass.topLeft.x, y: glass.topRight.y - glass.topLeft.y }
  const v = { x: glass.bottomLeft.x - glass.topLeft.x, y: glass.bottomLeft.y - glass.topLeft.y }
  const d = { x: p.x - glass.topLeft.x, y: p.y - glass.topLeft.y }
  const s = d.x / u.x
  const t = (d.y - s * u.y) / v.y
  return { s, t }
}

test('halloween garland hangs on the right-wall pier, clear of the clock, ops board and trim', () => {
  const { garland } = HALLOWEEN_ANCHORS
  const pierStart = RIGHT_WINDOWS[1].start + RIGHT_WINDOWS[1].length
  const pierEnd = RIGHT_WINDOWS[2].start
  assert.ok(garland.fromGx > pierStart, 'starts after the second right window')
  assert.ok(garland.toGx < pierEnd, 'ends before the third right window')
  // The lowest thing on the string is a hanging cutout, about 6 px below the dip.
  const lowest = garland.z - garland.sag - 6
  assert.ok(lowest > OPS_BOARD.z + OPS_BOARD.height / 2, 'clears the ops board')
  assert.ok(lowest > WALL_CLOCK.z + WALL_CLOCK.radius, 'clears the wall clock')
  assert.ok(garland.z < WALL_H - 5, 'hooks sit below the top trim')
  assert.ok(garland.z - garland.sag - 6 > WINDOW_TOP_Z, 'clears the window heads')
  assert.ok(garland.sag > 0)
})

test('halloween lantern hangs in the left-wall pier between the second and third windows', () => {
  const { lantern } = HALLOWEEN_ANCHORS
  const pierStart = LEFT_WINDOWS[1].start + LEFT_WINDOWS[1].length
  const pierEnd = LEFT_WINDOWS[2].start
  const half = Math.max(lantern.halfWidth, lantern.glowHalfWidth) / WALL_UNIT_PX
  assert.ok(lantern.gy - half > pierStart, 'clear of the second left window')
  assert.ok(lantern.gy + half < pierEnd, 'clear of the third left window')
  assert.ok(lantern.z - 12 > WINDOW_SILL_Z, 'hangs above the sill line')
  assert.ok(lantern.z + 12 < WINDOW_TOP_Z, 'hangs below the window heads')
})

test('the halloween cobweb fits inside the top-left corner of its pane', () => {
  const { wall, index } = HALLOWEEN_ANCHORS.cobweb
  const spec = RIGHT_WINDOWS[index]
  assert.ok(spec !== undefined)
  const glass = windowGlass(wall, spec, index)
  const web = 16
  assert.ok(web < glass.width && web < glass.height)
})

test('the moon bat sits fully inside the moon pane with room to spare', () => {
  const spec = RIGHT_WINDOWS[SKY_ORB_WINDOW.index]
  const orb = skyOrbPoint()
  // The same position the backdrop paints the orb at.
  assert.deepEqual(orb, iso(spec.start + spec.length * SKY_ORB.along, 0, SKY_ORB.z))

  const { dx, dy } = HALLOWEEN_ANCHORS.moonBat
  const centre = { x: orb.x + dx, y: orb.y + dy }
  // It reads as its own silhouette, not a smudge on the moon.
  assert.ok(Math.hypot(dx, dy) > SKY_ORB_NIGHT_RADIUS, 'clear of the moon disc')

  // Scaled 1.15 in the layer; the path spans -4.1..4.1 across and -2.7..1.5 down.
  const scale = 1.15
  const corners: ScreenPoint[] = []
  for (const x of [-4.1 * scale, 4.1 * scale]) {
    for (const y of [-2.7 * scale, 1.5 * scale]) corners.push({ x: centre.x + x, y: centre.y + y })
  }
  let minS = Infinity
  let maxS = -Infinity
  let minT = Infinity
  let maxT = -Infinity
  for (const corner of corners) {
    const { s, t } = paneCoordinates(SKY_ORB_WINDOW.wall, spec, SKY_ORB_WINDOW.index, corner)
    minS = Math.min(minS, s)
    maxS = Math.max(maxS, s)
    minT = Math.min(minT, t)
    maxT = Math.max(maxT, t)
  }
  const glass = windowGlass(SKY_ORB_WINDOW.wall, spec, SKY_ORB_WINDOW.index)
  const alongPx = glass.topRight.x - glass.topLeft.x
  const margin = 3
  assert.ok(minS * alongPx >= margin, 'clear of the window head-side frame')
  assert.ok((1 - maxS) * alongPx >= margin, 'clear of the far-side frame')
  assert.ok(minT * glass.height >= margin, 'clear of the top frame')
  assert.ok((1 - maxT) * glass.height >= margin, 'clear of the mullion')
})
