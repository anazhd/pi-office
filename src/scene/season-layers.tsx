/**
 * Everything seasonal that sits on top of the office backdrop: weather outside the glass, window
 * frames (moved out of the backdrop so weather renders behind the mullions), and one small wall
 * piece per wall. No holidays, no festive props.
 *
 * All three layers are memoised on stable primitives (season, sky phase, and the tick) so they
 * only re-render when the phase or the month changes -- or, for the weather, once per tick.
 */
import { memo, type ReactNode } from 'react'
import { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg'
import { iso } from './iso'
import { windowParticles, type Particle } from './season-particles'
import { SEASON_LOOKS, type OutsideKind, type Season, type SeasonLook } from './season'
import type { SkyPhase } from './sky'
import {
  LEFT_WINDOWS,
  RIGHT_WINDOWS,
  SEASON_DECOR_ANCHORS,
  WINDOW_SILL_Z,
  WINDOW_TOP_Z,
  leftWallTransform,
  rightWallTransform,
  windowGlass,
  type Wall,
  type WindowSpec,
} from './wall-art'

const PARTICLE_COLORS: Record<OutsideKind, string[]> = {
  snow: ['#F5F8FB', '#DCE6F2'],
  leaf: ['#C8642F', '#D9963A', '#A9472E', '#B8873A'],
  petal: ['#F4C9D4', '#F8E1E6', '#FFFFFF'],
  mote: ['#FFF3C8'],
  firefly: ['#E9F59A'],
}

const HORIZONTAL_MULLION_Z = 109

function clipId(wall: Wall, index: number): string {
  return `${wall === 'right' ? 'seasonR' : 'seasonL'}${index}`
}

/** Clip paths for the weather, in screen space. Static, so it never re-renders. */
export const SeasonClips = memo(function SeasonClips() {
  return (
    <Defs>
      {RIGHT_WINDOWS.map((spec, i) => (
        <ClipPath id={clipId('right', i)} key={`clip-r${i}`}>
          <Polygon points={windowGlass('right', spec, i).points} />
        </ClipPath>
      ))}
      {LEFT_WINDOWS.map((spec, i) => (
        <ClipPath id={clipId('left', i)} key={`clip-l${i}`}>
          <Polygon points={windowGlass('left', spec, i).points} />
        </ClipPath>
      ))}
    </Defs>
  )
})

function particleNode(kind: OutsideKind, particle: Particle, dim: number, key: number) {
  const colors = PARTICLE_COLORS[kind]
  const color = colors[particle.tone % colors.length]
  const opacity = Math.max(0, Math.min(1, particle.opacity * dim))
  const transform =
    `translate(${particle.x.toFixed(2)} ${particle.y.toFixed(2)}) rotate(${particle.rotation.toFixed(1)}) scale(${particle.size.toFixed(2)})`
  switch (kind) {
    case 'snow':
      return (
        <G key={key} transform={transform}>
          <Circle r={1.15} fill={color} opacity={opacity} />
        </G>
      )
    case 'leaf':
      return (
        <G key={key} transform={transform}>
          <Path d="M0,-2.6 Q1.7,0 0,2.6 Q-1.7,0 0,-2.6Z" fill={color} opacity={opacity} />
          <Line x1={0} y1={-2.6} x2={0} y2={2.6} stroke="#5C3520" strokeWidth={0.4} opacity={0.5} />
        </G>
      )
    case 'petal':
      return (
        <G key={key} transform={transform}>
          <Ellipse rx={1.7} ry={0.95} fill={color} opacity={opacity} />
        </G>
      )
    case 'mote':
      return (
        <G key={key} transform={transform}>
          <Circle r={0.9} fill={color} opacity={opacity} />
        </G>
      )
    case 'firefly':
      return (
        <G key={key} transform={transform}>
          <Circle r={3} fill={color} opacity={opacity * 0.25} />
          <Circle r={1.1} fill={color} opacity={opacity} />
        </G>
      )
  }
}

function WindowWeather({
  wall,
  spec,
  index,
  kind,
  dim,
  t,
}: {
  wall: Wall
  spec: WindowSpec
  index: number
  kind: OutsideKind
  dim: number
  t: number | null
}) {
  const glass = windowGlass(wall, spec, index)
  const particles = windowParticles(kind, {
    width: glass.width,
    height: glass.height,
    length: spec.length,
    seed: `${wall}${index}`,
    t,
  })
  // The clip stays on the outer, untransformed group: inside the wall matrix it would be
  // interpreted in local coordinates and break on native.
  return (
    <G clipPath={`url(#${clipId(wall, index)})`}>
      <G transform={glass.transform}>
        {particles.map((particle, i) => particleNode(kind, particle, dim, i))}
      </G>
    </G>
  )
}

/** Weather seen through the windows. t = null freezes it (reduced motion). */
export const SeasonOutside = memo(function SeasonOutside({
  season,
  phase,
  t,
}: {
  season: Season
  phase: SkyPhase
  t: number | null
}) {
  const look = SEASON_LOOKS[season]
  const night = phase === 'night'
  const kind: OutsideKind | null = night ? look.outsideNight : look.outsideDay
  const dim = night ? (kind === 'leaf' ? 0.5 : 0.75) : 1
  return (
    <G id={`season-${season}`}>
      {kind ? (
        <G>
          {RIGHT_WINDOWS.map((spec, i) => (
            <WindowWeather key={`w-r${i}`} wall="right" spec={spec} index={i} kind={kind} dim={dim} t={t} />
          ))}
          {LEFT_WINDOWS.map((spec, i) => (
            <WindowWeather key={`w-l${i}`} wall="left" spec={spec} index={i} kind={kind} dim={dim} t={t} />
          ))}
        </G>
      ) : null}
    </G>
  )
})

function Frost({ wall, spec, night }: { wall: Wall; spec: WindowSpec; night: boolean }) {
  const { width, height, transform } = windowGlass(wall, spec)
  const h = height
  const w = width
  const fill = '#EAF2F7'
  return (
    <G transform={transform} opacity={night ? 0.18 : 0.28}>
      <Path d={`M0 ${h} L0 ${h - 8} Q6 ${h - 4} 10 ${h} Z`} fill={fill} />
      <Path d={`M${w} ${h} L${w} ${h - 8} Q${w - 6} ${h - 4} ${w - 10} ${h} Z`} fill={fill} />
      <Path d={`M${w / 2 - 5} ${h} Q${w / 2 - 2} ${h - 6} ${w / 2} ${h - 9} L${w / 2} ${h} Z`} fill={fill} />
      <Path d={`M${w / 2 + 5} ${h} Q${w / 2 + 2} ${h - 6} ${w / 2} ${h - 9} L${w / 2} ${h} Z`} fill={fill} />
    </G>
  )
}

function WindowFrame({
  wall,
  spec,
  night,
  frost,
}: {
  wall: Wall
  spec: WindowSpec
  night: boolean
  frost: boolean
}) {
  const { start, length } = spec
  const corner = (along: number, z: number) => (wall === 'right' ? iso(along, 0, z) : iso(0, along, z))
  const p1 = corner(start, WINDOW_SILL_Z)
  const p2 = corner(start + length, WINDOW_SILL_Z)
  const t1 = corner(start, WINDOW_TOP_Z)
  const t2 = corner(start + length, WINDOW_TOP_Z)
  const mull = corner(start, HORIZONTAL_MULLION_Z)
  const mull2 = corner(start + length, HORIZONTAL_MULLION_Z)
  const stroke = wall === 'right' ? '#2A2119' : '#241C16'
  const outline = `${p1.x},${p1.y} ${p2.x},${p2.y} ${t2.x},${t2.y} ${t1.x},${t1.y}`
  return (
    <G>
      <Polygon points={outline} fill="none" stroke={stroke} strokeWidth={3.2} />
      <Line
        x1={(p1.x + p2.x) / 2}
        y1={(p1.y + p2.y) / 2}
        x2={(t1.x + t2.x) / 2}
        y2={(t1.y + t2.y) / 2}
        stroke={stroke}
        strokeWidth={2.4}
      />
      <Line x1={mull.x} y1={mull.y} x2={mull2.x} y2={mull2.y} stroke={stroke} strokeWidth={2.2} />
      <Polygon
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p2.x},${p2.y + 5} ${p1.x},${p1.y + 5}`}
        fill={wall === 'right' ? '#8A7258' : '#7A6550'}
      />
      {frost ? <Frost wall={wall} spec={spec} night={night} /> : null}
      {wall === 'right' ? (
        <Polygon
          points={`${p1.x + 4},${p1.y - 9} ${p1.x + 12},${p1.y - 4} ${p1.x + 12},${t1.y + 8} ${p1.x + 4},${t1.y + 3}`}
          fill="#FFFFFF"
          opacity={night ? 0.025 : 0.09}
        />
      ) : null}
    </G>
  )
}

/** Frame, mullions, sill and glare for all six windows, plus winter frost on the glass. */
export const WindowFrames = memo(function WindowFrames({
  night,
  season,
}: {
  night: boolean
  season: Season
}) {
  const frost = SEASON_LOOKS[season].frost
  return (
    <G>
      {RIGHT_WINDOWS.map((spec, i) => (
        <WindowFrame key={`frame-r${i}`} wall="right" spec={spec} night={night} frost={frost} />
      ))}
      {LEFT_WINDOWS.map((spec, i) => (
        <WindowFrame key={`frame-l${i}`} wall="left" spec={spec} night={night} frost={frost} />
      ))}
    </G>
  )
})

function Nail() {
  return (
    <G>
      <Circle cx={0} cy={-2} r={1.6} fill="#2A2119" opacity={0.85} />
      <Circle cx={-0.4} cy={-2.5} r={0.6} fill="#8A7258" opacity={0.5} />
    </G>
  )
}

const MAPLE = 'M0,-5 L2.2,-2.2 L5,-2.8 L3.4,-0.2 L5.4,2 L2.4,1.8 L0,5 L-2.4,1.8 L-5.4,2 L-3.4,-0.2 L-5,-2.8 L-2.2,-2.2 Z'

function SummerHat() {
  return (
    <G>
      <Nail />
      <Ellipse cx={0} cy={6} rx={11} ry={3.4} fill="#D8B26A" stroke="#A9853F" strokeWidth={0.7} />
      <Path d="M-6.4 5.4 Q-6.4 -6 0 -6.4 Q6.4 -6 6.4 5.4 Z" fill="#E3C079" stroke="#B89550" strokeWidth={0.7} />
      <Path d="M-6.2 1.2 L6.2 1.2 L6.2 3.4 L-6.2 3.4 Z" fill="#8A5A3C" opacity={0.9} />
      <Circle cx={0} cy={-6.3} r={1.1} fill="#B89550" />
      <Line x1={2} y1={5.6} x2={5.6} y2={9} stroke="#7F9A6A" strokeWidth={1} strokeLinecap="round" />
      <Ellipse cx={6.2} cy={9.6} rx={1.3} ry={0.9} fill="#8FAE74" />
    </G>
  )
}

function PineSprig({ full }: { full: boolean }) {
  const needles: Array<[number, number, number, number]> = full
    ? [
        [-1, 1, -6, 4],
        [1, 1, 6, 4],
        [-1, 5, -7, 9],
        [1, 5, 7, 9],
        [-1, 9, -5, 13],
        [1, 9, 5, 13],
      ]
    : [
        [-1, 1, -5, 5],
        [1, 3, 5, 7],
        [-1, 6, -4, 10],
      ]
  return (
    <G>
      <Nail />
      <Line x1={0} y1={-1} x2={0} y2={full ? 13 : 11} stroke="#4A5C42" strokeWidth={1.2} strokeLinecap="round" />
      {needles.map(([x1, y1, x2, y2], i) => (
        <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3F6B4A" strokeWidth={1.3} strokeLinecap="round" />
      ))}
      {full ? (
        <G>
          <Ellipse cx={-3.4} cy={8.6} rx={2.2} ry={2.9} fill="#7A4B2C" />
          <Ellipse cx={3.8} cy={12} rx={1.9} ry={2.5} fill="#8A5631" />
        </G>
      ) : null}
      <Circle cx={full ? -6.5 : -5.2} cy={1} r={0.9} fill="#EAF2F7" opacity={0.85} />
      <Circle cx={full ? 6.2 : 4.6} cy={7} r={0.8} fill="#EAF2F7" opacity={0.75} />
    </G>
  )
}

function HangingPlanter() {
  return (
    <G>
      <Nail />
      <Path d="M-6 -1 L6 -1 L4 9 L-4 9 Z" fill="#A9603F" stroke="#6E3A26" strokeWidth={0.8} />
      <Rect x={-6.6} y={-2.4} width={13.2} height={2.4} rx={1} fill="#8A4C33" />
      <Path d="M-2 9 Q-7 14 -9 19" stroke="#6F9B63" strokeWidth={1.1} fill="none" strokeLinecap="round" />
      <Path d="M2 9 Q6 13 8 18" stroke="#6F9B63" strokeWidth={1.1} fill="none" strokeLinecap="round" />
      <Ellipse cx={-8} cy={15} rx={1.7} ry={1.1} fill="#7FAE6D" transform="rotate(-25 -8 15)" />
      <Ellipse cx={-9.2} cy={19} rx={1.6} ry={1} fill="#6F9B63" transform="rotate(-15 -9.2 19)" />
      <Ellipse cx={7.2} cy={14} rx={1.6} ry={1} fill="#7FAE6D" transform="rotate(20 7.2 14)" />
      <Ellipse cx={8.4} cy={18.4} rx={1.5} ry={1} fill="#6F9B63" transform="rotate(10 8.4 18.4)" />
      <Circle cx={-3.6} cy={-4.6} r={1.7} fill="#F2C6D2" />
      <Circle cx={2.4} cy={-5.2} r={1.5} fill="#F5E6A8" />
      <Circle cx={5.4} cy={-1.8} r={1.2} fill="#F2C6D2" />
      <Circle cx={-5.6} cy={-1.4} r={1.1} fill="#F5E6A8" />
    </G>
  )
}

function SmallSprig() {
  return (
    <G>
      <Nail />
      <Line x1={0} y1={-1} x2={-3} y2={11} stroke="#5E7A52" strokeWidth={1} strokeLinecap="round" />
      <Line x1={0} y1={-1} x2={3.5} y2={9} stroke="#5E7A52" strokeWidth={1} strokeLinecap="round" />
      <Line x1={0} y1={-1} x2={0.5} y2={13} stroke="#4E6A45" strokeWidth={1} strokeLinecap="round" />
      <Ellipse cx={-2.4} cy={6} rx={1.7} ry={1} fill="#7FAE6D" transform="rotate(-30 -2.4 6)" />
      <Ellipse cx={3} cy={5} rx={1.6} ry={1} fill="#7FAE6D" transform="rotate(30 3 5)" />
      <Ellipse cx={0.6} cy={10} rx={1.5} ry={0.9} fill="#6F9B63" />
      <Circle cx={-1.8} cy={2} r={1.3} fill="#F2C6D2" />
      <Circle cx={2.2} cy={1} r={1.1} fill="#F5E6A8" />
    </G>
  )
}

function MapleLeaves() {
  return (
    <G>
      <Nail />
      <Path d={MAPLE} fill="#C8792F" transform="translate(-4 5) rotate(-18) scale(0.92)" />
      <Path d={MAPLE} fill="#B5532F" transform="translate(4.5 7.5) rotate(16) scale(0.8)" />
      <Path d={MAPLE} fill="#D9A441" transform="translate(0.5 0.5) scale(1)" />
      <Line x1={0.5} y1={4.5} x2={0.5} y2={8} stroke="#8A5A2C" strokeWidth={0.7} />
      <Line x1={-4} y1={9.5} x2={-4} y2={12.5} stroke="#8A5A2C" strokeWidth={0.6} />
      <Line x1={4.5} y1={10.5} x2={4.5} y2={13} stroke="#8A5A2C" strokeWidth={0.6} />
    </G>
  )
}

function LavenderSprig() {
  return (
    <G>
      <Nail />
      <Line x1={0} y1={-1} x2={-2} y2={12} stroke="#8C9A6A" strokeWidth={1} strokeLinecap="round" />
      <Line x1={0} y1={-1} x2={2.4} y2={11} stroke="#8C9A6A" strokeWidth={1} strokeLinecap="round" />
      {[
        [-2.2, -4],
        [-0.4, -5],
        [1.6, -4.4],
        [-2.4, 0],
        [-0.6, -1],
        [1.8, 0.4],
      ].map(([x, y], i) => (
        <Ellipse key={i} cx={x} cy={y} rx={1.1} ry={1.5} fill={i % 2 ? '#9A84B8' : '#8570A8'} />
      ))}
      <Ellipse cx={-1.8} cy={6} rx={1.6} ry={0.9} fill="#8C9A6A" transform="rotate(-40 -1.8 6)" />
      <Ellipse cx={2.2} cy={4.5} rx={1.5} ry={0.9} fill="#8C9A6A" transform="rotate(40 2.2 4.5)" />
    </G>
  )
}

function AcornBundle() {
  const acorn = (x: number, y: number, rotation: number, key: number) => (
    <G key={key} transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <Line x1={0} y1={-4} x2={0} y2={-6} stroke="#5C3F2A" strokeWidth={0.7} strokeLinecap="round" />
      <Ellipse cx={0} cy={1} rx={2.6} ry={3.4} fill="#C9A06A" stroke="#9C7745" strokeWidth={0.5} />
      <Path d="M-3 -1 Q0 -4.6 3 -1 Z" fill="#7A5233" />
    </G>
  )
  return (
    <G>
      <Nail />
      <Path d="M0 0 Q-1 4 0.5 7" stroke="#6B5236" strokeWidth={0.9} fill="none" strokeLinecap="round" />
      {acorn(-3.4, 8, -14, 0)}
      {acorn(3.2, 10, 12, 1)}
      {acorn(0, 3.4, 0, 2)}
      <Ellipse cx={-5} cy={2} rx={1.6} ry={0.9} fill="#8D6B3C" transform="rotate(-30 -5 2)" />
      <Ellipse cx={5} cy={4.5} rx={1.5} ry={0.9} fill="#B5532F" transform="rotate(28 5 4.5)" />
    </G>
  )
}

type DecorKind = SeasonLook['decor']

function rightDecor(kind: DecorKind): ReactNode {
  switch (kind) {
    case 'pine':
      return <PineSprig full />
    case 'planter':
      return <HangingPlanter />
    case 'hat':
      return <SummerHat />
    case 'leaves':
      return <MapleLeaves />
  }
}

function leftDecor(kind: DecorKind): ReactNode {
  switch (kind) {
    case 'pine':
      return <PineSprig full={false} />
    case 'planter':
      return <SmallSprig />
    case 'hat':
      return <LavenderSprig />
    case 'leaves':
      return <AcornBundle />
  }
}

/** One small wall-mounted piece per wall. Nothing on the floor, so routing and depth are untouched. */
export const SeasonDecor = memo(function SeasonDecor({
  season,
  night,
}: {
  season: Season
  night: boolean
}) {
  const { decor } = SEASON_LOOKS[season]
  return (
    <G opacity={night ? 0.85 : 1}>
      <G transform={rightWallTransform(SEASON_DECOR_ANCHORS.right.gx, SEASON_DECOR_ANCHORS.right.z)}>
        {rightDecor(decor)}
      </G>
      <G transform={leftWallTransform(SEASON_DECOR_ANCHORS.left.gy, SEASON_DECOR_ANCHORS.left.z)}>
        {leftDecor(decor)}
      </G>
    </G>
  )
})
