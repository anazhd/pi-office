/**
 * Deterministic weather outside one window pane. Pure: the same input always produces the same
 * particles, and t = null freezes them at a fixed rest position (reduced motion), with half the
 * count. Positions are in wall-local pixels, inside a 0..width by 0..height pane.
 */
import { clamp, hashString } from './iso.ts'
import type { OutsideKind } from './season.ts'

export type Particle = {
  x: number
  y: number
  /** Scale multiplier applied to the base shape (about 0.75-1.4). */
  size: number
  /** Degrees. */
  rotation: number
  opacity: number
  /** Index into the kind's colour list. */
  tone: number
}

export type WindowParticleInput = {
  width: number
  height: number
  /** Window length in grid units; it sets the count. */
  length: number
  seed: string | number
  /** Animated clock in ms, or null to freeze (reduced motion). */
  t: number | null
}

/** Particles per grid unit of window length. */
const DENSITY: Record<OutsideKind, number> = {
  snow: 4,
  leaf: 1.2,
  petal: 1.5,
  mote: 1,
  firefly: 1,
}

/** How far outside the pane a particle may sit before it wraps. */
export const PARTICLE_MARGIN = 4
/** Budget across all six windows; the widest season (snow) uses 57. */
export const MAX_TOTAL_PARTICLES = 64

export function particleCount(kind: OutsideKind, length: number): number {
  return Math.round(DENSITY[kind] * Math.max(length, 0))
}

function rngFrom(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const TAU = Math.PI * 2

export function windowParticles(
  kind: OutsideKind,
  { width, height, length, seed, t }: WindowParticleInput,
): Particle[] {
  if (!(width > 0) || !(height > 0)) return []
  const animated = t !== null
  const seconds = (t ?? 0) / 1000
  const span = height + PARTICLE_MARGIN * 2
  const baseCount = particleCount(kind, length)
  const count = animated ? baseCount : Math.ceil(baseCount / 2)
  if (count <= 0) return []

  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const rng = rngFrom(hashString(`${kind}:${seed}:${i}`))
    const r1 = rng()
    const r2 = rng()
    const r3 = rng()
    const r4 = rng()
    const r5 = rng()
    const r6 = rng()
    const size = 0.75 + r5 * 0.65

    switch (kind) {
      case 'snow': {
        const fall = 9 + r1 * 5
        const y = -PARTICLE_MARGIN + ((r2 * span + fall * seconds) % span)
        const sway = Math.sin(seconds * 0.9 + r4 * TAU) * 3
        const x = clamp(PARTICLE_MARGIN + r3 * (width - PARTICLE_MARGIN * 2) + sway, 0, width)
        particles.push({ x, y, size, rotation: 0, opacity: 0.7 + r6 * 0.3, tone: i % 2 })
        break
      }
      case 'leaf': {
        const fall = 16 + r1 * 8
        const drift = 6 + r4 * 4
        const y = -PARTICLE_MARGIN + ((r2 * span + fall * seconds) % span)
        const x = (r3 * width + drift * seconds) % width
        const rotation = (r5 * 360 + seconds * (40 + r6 * 50)) % 360
        particles.push({ x, y, size, rotation, opacity: 0.78 + r6 * 0.22, tone: i % 4 })
        break
      }
      case 'petal': {
        const fall = 5 + r1 * 3
        const drift = 8 + r4 * 4
        const y = -PARTICLE_MARGIN + ((r2 * span + fall * seconds) % span)
        const sway = Math.sin(seconds * 0.7 + r5 * TAU) * 2
        const x = clamp(((r3 * width + drift * seconds) % width) + sway, 0, width)
        const rotation = (r5 * 360 + seconds * (25 + r6 * 35)) % 360
        particles.push({ x, y, size, rotation, opacity: 0.6 + r6 * 0.15, tone: i % 3 })
        break
      }
      case 'mote': {
        const rise = 3
        const y = height + PARTICLE_MARGIN - ((r2 * span + rise * seconds) % span)
        const sway = Math.sin(seconds * 0.5 + r4 * TAU) * 2
        const x = clamp(PARTICLE_MARGIN + r3 * (width - PARTICLE_MARGIN * 2) + sway, 0, width)
        particles.push({ x, y, size, rotation: 0, opacity: 0.25 + r6 * 0.15, tone: 0 })
        break
      }
      case 'firefly': {
        const period = 2.5 + r1 * 1.5
        const pulse = 0.5 + 0.5 * Math.sin((TAU * seconds) / period + r2 * TAU)
        const inset = PARTICLE_MARGIN + 4
        const baseX = Math.min(inset, width / 2) + r3 * Math.max(0, width - Math.min(inset, width / 2) * 2)
        const baseY = Math.min(inset, height / 2) + r4 * Math.max(0, height - Math.min(inset, height / 2) * 2)
        const angle = r5 * TAU + seconds * 0.35
        particles.push({
          x: clamp(baseX + Math.cos(angle) * 4, 0, width),
          y: clamp(baseY + Math.sin(angle) * 4, 0, height),
          size: 0.9 + r6 * 0.3,
          rotation: 0,
          opacity: 0.15 + 0.65 * pulse,
          tone: 0,
        })
        break
      }
    }
  }
  return particles
}
