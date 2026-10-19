import assert from 'node:assert/strict'
import test from 'node:test'
import { FURNITURE_BOUNDS } from '../furniture-bounds.ts'
import { OBSTACLES, ROUTING_ITEMS } from '../routing-obstacles.ts'
import {
  DESK_SEATS,
  LOUNGE_SEATS,
  LOUNGE_OVERFLOW_SPOTS,
  LOUNGE_CROWD_SPOTS,
  STANDING_OVERFLOW_SPOTS,
  STANDING_CROWD_SPOTS,
  DOOR,
  buildRoute,
  buildRetargetPath,
  pathLength,
  pointAlong,
  portalForSeat,
  seatOwnFootprints,
  segmentCrossesObstacle,
  type Seat,
} from '../layout.ts'
import type { Point } from '../iso.ts'

const seats: Seat[] = [
  ...DESK_SEATS,
  ...LOUNGE_SEATS,
  ...LOUNGE_OVERFLOW_SPOTS,
  ...LOUNGE_CROWD_SPOTS,
  ...STANDING_OVERFLOW_SPOTS,
  ...STANDING_CROWD_SPOTS,
  { ...DOOR, id: 'door', kind: 'standing', facing: 'up' },
]
const same = (a: Point, b: Point) => Math.hypot(a.gx - b.gx, a.gy - b.gy) < 1e-6
function validate(path: Point[], a: Seat, b: Seat, first: ReturnType<typeof seatOwnFootprints>) {
  assert.ok(same(path.at(-1)!, b), `ends at ${b.id}`)
  for (let i = 1; i < path.length; i++)
    for (const { key, box } of ROUTING_ITEMS) {
      if (i === 1 && first.includes(box)) continue
      if (i === path.length - 1 && seatOwnFootprints(b).includes(box)) continue
      assert.equal(
        segmentCrossesObstacle(path[i - 1], path[i], box, 0.2),
        false,
        `${a.id}->${b.id}, segment ${i}, ${key}: ${JSON.stringify(path)}`,
      )
    }
}

test('every rendered furniture bound has an exact routing obstacle (including every plant and sofa slab)', () => {
  assert.equal(ROUTING_ITEMS.length, FURNITURE_BOUNDS.size)
  for (const [key, b] of FURNITURE_BOUNDS) {
    const item = ROUTING_ITEMS.find((i) => i.key === key)!
    assert.ok(item, key)
    assert.deepEqual(
      [item.box.gx, item.box.gy, item.box.gx + item.box.w, item.box.gy + item.box.d],
      [b.x0, b.y0, b.x1, b.y1],
    )
    assert.ok(OBSTACLES.includes(item.box))
  }
})

test('backed seats use their open/front side; sofa exemptions are seat-sized, never the whole sofa', () => {
  for (const s of [...DESK_SEATS, ...LOUNGE_SEATS]) {
    const p = portalForSeat(s)
    assert.ok(
      !OBSTACLES.some((b) => segmentCrossesObstacle(p, p, b, 0.2)),
      `${s.id} portal clear at full radius`,
    )
    if (s.kind === 'sofa') {
      assert.ok(p.gx > s.gx && p.gy === s.gy)
      assert.equal(seatOwnFootprints(s).length, 1)
      assert.ok(seatOwnFootprints(s)[0].d < 1)
    }
    if (s.kind === 'desk' || s.kind === 'window') assert.ok(p.gy > s.gy)
    if (s.kind === 'armchair') assert.ok(p.gx < s.gx)
  }
})

test('exhaustive all-seat pairs, door, overflow and standing: full-radius clearance and retargets at three times', () => {
  let checked = 0
  for (const a of seats)
    for (const b of seats) {
      if (a === b) continue
      const path = buildRoute(a, b, a.id === 'door' ? null : a)
      assert.ok(path, `${a.id}->${b.id} reachable`)
      validate(path, a, b, seatOwnFootprints(a))
      if (seatOwnFootprints(a).length) assert.ok(same(path[1], portalForSeat(a)))
      if (seatOwnFootprints(b).length) assert.ok(same(path.at(-2)!, portalForSeat(b)))
      // Retarget every ordered pair back toward its origin, including inside both seat legs.
      for (const t of [0.01, 0.5, 0.99]) {
        const current = pointAlong(path, t)
        const next = buildRetargetPath(path, current, t * pathLength(path), a, {
          toKind: a.kind,
          toRow: a.row,
        })
        assert.ok(next, `${a.id}->${b.id} retarget at ${t}`)
        assert.ok(same(next[0], current))
        const owner =
          t * pathLength(path) <=
          Math.hypot(a.gx - portalForSeat(a).gx, a.gy - portalForSeat(a).gy) + 1e-6
            ? a
            : b
        const own = seatOwnFootprints(owner)
        validate(next, b, a, own)
        if (OBSTACLES.some((box) => segmentCrossesObstacle(current, current, box, 0.2))) {
          assert.ok(
            same(next[1], portalForSeat(owner)),
            'retarget leaves along the verified open-side leg',
          )
        }
        checked++
      }
    }
  assert.ok(checked > 20000)
})

test('repeated retargets inside a seat leg retain its verified front-side exit', () => {
  for (const origin of [...DESK_SEATS, ...LOUNGE_SEATS]) {
    let path = buildRoute(origin, DESK_SEATS[0], origin)!
    for (let round = 0; round < 3; round++) {
      const current = pointAlong(path, 0.001)
      const target = DESK_SEATS[round + 1]
      const next = buildRetargetPath(path, current, 0.001 * pathLength(path), target, {
        toKind: target.kind,
        toRow: target.row,
      })
      assert.ok(next, `${origin.id}, retarget ${round}`)
      assert.ok(same(next[0], current))
      assert.ok(same(next[1], portalForSeat(origin)))
      validate(next, origin, target, seatOwnFootprints(origin))
      path = next
    }
  }
})

test('sofa and all four pots: desk trips never intersect their padded bounds; arbitrary embedded connectors are rejected', () => {
  const items = ROUTING_ITEMS.filter((i) => i.key.startsWith('plant-') || i.key.startsWith('sofa-'))
  assert.equal(items.filter((i) => i.key.startsWith('plant-')).length, 4)
  for (const item of items) {
    const b = item.box
    const embedded = { gx: b.gx + b.w / 2, gy: b.gy + b.d / 2 }
    assert.equal(buildRoute(embedded, DESK_SEATS[0], null), null)
    for (const lounge of LOUNGE_SEATS)
      for (const desk of DESK_SEATS) {
        for (const [a, z] of [
          [lounge, desk],
          [desk, lounge],
        ]) {
          const path = buildRoute(a, z, a)!
          validate(path, a, z, seatOwnFootprints(a))
        }
      }
  }
})
