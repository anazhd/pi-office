// Weather outside one pane: deterministic, in-bounds, and frozen (with fewer particles) when
// reduced motion asks for stillness.
import assert from 'node:assert/strict'
import test from 'node:test'
import { windowParticles, MAX_TOTAL_PARTICLES, PARTICLE_MARGIN, particleCount, type Particle } from '../season-particles.ts'
import type { OutsideKind } from '../season.ts'
import { LEFT_WINDOWS, RIGHT_WINDOWS, windowGlass } from '../wall-art.ts'

const KINDS: OutsideKind[] = ['snow', 'leaf', 'petal', 'mote', 'firefly']

function pane(wall: 'left' | 'right', index: number) {
  const spec = (wall === 'right' ? RIGHT_WINDOWS : LEFT_WINDOWS)[index]
  const glass = windowGlass(wall, spec, index)
  return { width: glass.width, height: glass.height, length: spec.length }
}

function assertFinite(particles: Particle[]) {
  for (const p of particles) {
    for (const value of [p.x, p.y, p.size, p.rotation, p.opacity]) {
      assert.ok(Number.isFinite(value), 'finite particle value')
    }
    assert.ok(p.opacity >= 0 && p.opacity <= 1)
  }
}

test('the same input always produces the same particles', () => {
  for (const kind of KINDS) {
    const input = { ...pane('right', 0), seed: 'right0', t: 1_234_567 }
    assert.deepEqual(windowParticles(kind, input), windowParticles(kind, input))
    assert.notDeepEqual(windowParticles(kind, input), windowParticles(kind, { ...input, t: 1_234_567 + 900 }))
  }
})

test('particles stay inside the pane plus a small margin', () => {
  for (const kind of KINDS) {
    for (const wall of ['right', 'left'] as const) {
      for (const index of [0, 1, 2]) {
        const { width, height, length } = pane(wall, index)
        for (const t of [0, 1, 5_000, 61_000, 3_600_000, null]) {
          const particles = windowParticles(kind, { width, height, length, seed: wall + index, t })
          assert.ok(particles.length > 0, `${kind} produces particles`)
          assertFinite(particles)
          for (const p of particles) {
            assert.ok(p.x >= -PARTICLE_MARGIN && p.x <= width + PARTICLE_MARGIN, `${kind} x ${p.x}`)
            assert.ok(p.y >= -PARTICLE_MARGIN && p.y <= height + PARTICLE_MARGIN, `${kind} y ${p.y}`)
          }
        }
      }
    }
  }
})

test('reduced motion freezes the weather, with fewer particles', () => {
  for (const kind of KINDS) {
    const base = { ...pane('right', 0), seed: 'right0' }
    const frozen = windowParticles(kind, { ...base, t: null })
    assert.deepEqual(frozen, windowParticles(kind, { ...base, t: null }))
    const animated = windowParticles(kind, { ...base, t: 0 })
    assert.ok(frozen.length < animated.length, `${kind}: ${frozen.length} frozen vs ${animated.length} animated`)
    assert.equal(frozen.length, Math.ceil(animated.length / 2))
  }
})

test('snow falls and leaves spin over a second', () => {
  const base = { ...pane('right', 1), seed: 'right1' }
  const particles = windowParticles('snow', { ...base, t: 0 })
  const later = windowParticles('snow', { ...base, t: 1_000 })
  particles.forEach((p, i) => {
    // Ignore particles close to the wrap point; everything above it falls by 9-14 px per second.
    if (p.y < base.height - 30) assert.ok(later[i].y > p.y, 'snow falls')
  })
  const leaves = windowParticles('leaf', { ...base, t: 0 })
  const leavesLater = windowParticles('leaf', { ...base, t: 1_000 })
  assert.ok(leaves.some((leaf, i) => leaf.rotation !== leavesLater[i].rotation), 'leaves rotate')
})

test('fireflies pulse between dim and bright within a sane range', () => {
  for (const t of [0, 700, 1_600, 2_400, 3_100, 4_400, 5_900]) {
    for (const p of windowParticles('firefly', { ...pane('left', 0), seed: 'left0', t })) {
      assert.ok(p.opacity >= 0.1 && p.opacity <= 0.8, `firefly opacity ${p.opacity}`)
    }
  }
})

test('the whole office keeps within the particle budget in the busiest season', () => {
  for (const kind of KINDS) {
    let total = 0
    for (const spec of RIGHT_WINDOWS) total += particleCount(kind, spec.length)
    for (const spec of LEFT_WINDOWS) total += particleCount(kind, spec.length)
    assert.ok(total <= MAX_TOTAL_PARTICLES, `${kind} uses ${total} particles`)
  }
  // What is actually rendered: every window at once, per season weather.
  for (const kind of KINDS) {
    let rendered = 0
    for (const wall of ['right', 'left'] as const) {
      for (const index of [0, 1, 2]) {
        const { width, height, length } = pane(wall, index)
        rendered += windowParticles(kind, { width, height, length, seed: wall + index, t: 0 }).length
      }
    }
    assert.ok(rendered <= MAX_TOTAL_PARTICLES, `${kind} renders ${rendered} particles`)
  }
})

test('degenerate panes produce nothing instead of NaN', () => {
  assert.deepEqual(windowParticles('snow', { width: 0, height: 100, length: 2, seed: 'x', t: 0 }), [])
  assert.deepEqual(windowParticles('snow', { width: 100, height: 0, length: 2, seed: 'x', t: 0 }), [])
  assert.deepEqual(windowParticles('snow', { width: 100, height: 100, length: 0, seed: 'x', t: 0 }), [])
})
