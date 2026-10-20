/**
 * The dated Halloween overlay: static, wall-mounted SVG drawn on top of whatever season it is.
 * Nothing here touches the season (sky, light pool, floor tint, weather, season wall pieces): the
 * season resolves exactly as it always did, and this is an independent second layer.
 *
 * Everything is static art with plain shapes -- no particles, no animation, no gradients, no text,
 * nothing on the floor (so routing and depth are untouched), and nothing that needs a clip path.
 * Both components are memoised on primitives only (festive kind, sky phase), so they re-render at
 * a sky-phase change and never on the tick. Reduced motion needs no extra handling.
 */
import { memo } from 'react'
import { Circle, Ellipse, G, Line, Path, Polygon } from 'react-native-svg'
import type { Festive } from './festive'
import type { SkyPhase } from './sky'
import {
  HALLOWEEN_ANCHORS,
  RIGHT_WINDOWS,
  WALL_UNIT_PX,
  leftWallTransform,
  rightWallTransform,
  skyOrbPoint,
  windowGlass,
} from './wall-art'

const INK = '#1A1420'
const PAPER = '#2A2328'
const STRING = '#3B3036'
const ORANGE = '#C9672E'
const PLUM = '#5B3F66'
const PUMPKIN = '#D9772F'
const PUMPKIN_DARK = '#A8521F'
const STEM = '#5E6B3A'
const FACE_DARK = '#3A2418'
const FACE_LIT = '#F6B44A'
const GLOW = '#F59B3A'
const WEB = '#EDE6DA'
const NAIL = '#2A2119'

/** A small bat silhouette, wings up and scalloped, centred on the origin (about 8 x 4 px). */
const BAT = 'M0,-1.6 L-1.2,-2.7 L-2.5,-1.3 L-4.1,-2.3 L-3.3,-0.3 L-2.3,0.7 L-1.2,0.3 L0,1.5 L1.2,0.3 L2.3,0.7 L3.3,-0.3 L4.1,-2.3 L2.5,-1.3 L1.2,-2.7 Z'

const GARLAND_ITEMS = 9

/** Paper bats and cutouts strung across the right wall, sagging between two hooks. */
function PaperGarland() {
  const { fromGx, toGx, z, sag } = HALLOWEEN_ANCHORS.garland
  const length = (toGx - fromGx) * WALL_UNIT_PX
  const midX = length / 2
  // Sample the same quadratic as the string (endpoints y=-1, control y=2*sag).
  const hooks: Array<{ x: number; y: number; kind: 'bat' | 'cutout'; fill: string }> = Array.from(
    { length: GARLAND_ITEMS },
    (_, i) => {
      const t = (i + 1) / (GARLAND_ITEMS + 1)
      return {
        x: t * length,
        y: -1 + (4 * sag + 2) * t * (1 - t),
        kind: i % 2 === 0 ? 'bat' : 'cutout',
        fill: i % 4 === 1 ? ORANGE : PLUM,
      }
    },
  )
  return (
    <G transform={rightWallTransform(fromGx, z)}>
      <Circle cx={0} cy={-2} r={1.5} fill={NAIL} opacity={0.85} />
      <Circle cx={length} cy={-2} r={1.5} fill={NAIL} opacity={0.85} />
      <Path d={`M0 -1 Q${midX} ${2 * sag} ${length} -1`} fill="none" stroke={STRING} strokeWidth={0.7} />
      {hooks.map((hook, i) => (
        <G key={i} transform={`translate(${hook.x.toFixed(2)} ${hook.y.toFixed(2)})`}>
          <Line x1={0} y1={0} x2={0} y2={2} stroke={STRING} strokeWidth={0.5} />
          {hook.kind === 'bat' ? (
            <Path d={BAT} fill={PAPER} transform="translate(0 4)" />
          ) : (
            <Polygon points={`-2,2 2,2 0,5.6`} fill={hook.fill} />
          )}
        </G>
      ))}
    </G>
  )
}

/** Felt jack-o'-lantern hanging on the left wall; its face lights up at dusk and at night. */
function JackOLantern({ lit }: { lit: boolean }) {
  const face = lit ? FACE_LIT : FACE_DARK
  return (
    <G>
      {lit ? (
        <G>
          {/* Keep the glow within the narrow wall pier, clear of the window frames. */}
          <Ellipse cx={0} cy={2} rx={HALLOWEEN_ANCHORS.lantern.glowHalfWidth} ry={17} fill={GLOW} opacity={0.085} />
          <Ellipse cx={0} cy={2} rx={12} ry={10} fill={GLOW} opacity={0.06} />
        </G>
      ) : null}
      <Circle cx={0} cy={-2} r={1.6} fill={NAIL} opacity={0.85} />
      <Line x1={0} y1={-2} x2={0} y2={-7} stroke="#6B5236" strokeWidth={0.7} />
      <Path d="M-1.5 -6.6 L1.6 -6.6 L2.1 -9.6 L-0.4 -9.6 Z" fill={STEM} />
      <Ellipse cx={0} cy={1} rx={8} ry={6.6} fill={PUMPKIN} stroke={PUMPKIN_DARK} strokeWidth={0.8} />
      <Path d="M-4.3 -4.6 Q-6.1 1 -4.3 6.6" fill="none" stroke={PUMPKIN_DARK} strokeWidth={0.5} opacity={0.6} />
      <Path d="M4.3 -4.6 Q6.1 1 4.3 6.6" fill="none" stroke={PUMPKIN_DARK} strokeWidth={0.5} opacity={0.6} />
      <Polygon points="-4.9,-2.4 -1.7,-2.7 -3.1,-0.3" fill={face} />
      <Polygon points="4.9,-2.4 1.7,-2.7 3.1,-0.3" fill={face} />
      <Path d="M-4.4 2.3 L-2.9 3.7 L-1.3 2.3 L0.3 3.7 L1.9 2.3 L3.3 3.7 L4.3 2.5 L4.3 4.7 L-4.4 4.7 Z" fill={face} />
    </G>
  )
}

/** Four radial threads, three connecting arcs and a spider, in the top-left corner of one pane. */
function WindowCobweb({ night }: { night: boolean }) {
  const { wall, index } = HALLOWEEN_ANCHORS.cobweb
  const glass = windowGlass(wall, RIGHT_WINDOWS[index], index)
  const opacity = night ? 0.3 : 0.5
  const angles = [0, 30, 60, 90].map((degrees) => (degrees * Math.PI) / 180)
  const radius = 16
  const point = (r: number, angle: number) => ({
    x: Number((Math.cos(angle) * r).toFixed(2)),
    y: Number((Math.sin(angle) * r).toFixed(2)),
  })
  const arcs: string[] = []
  for (const r of [6, 10.5, 15]) {
    for (let i = 0; i < angles.length - 1; i++) {
      const from = point(r, angles[i])
      const to = point(r, angles[i + 1])
      const control = point(r * 0.78, (angles[i] + angles[i + 1]) / 2)
      arcs.push(`M${from.x} ${from.y} Q${control.x} ${control.y} ${to.x} ${to.y}`)
    }
  }
  const spider = point(11, angles[1])
  const legs = 'M-1.1,-0.8 L-2.4,-1.5 M-1.1,0.6 L-2.4,1.1 M1.1,-0.8 L2.4,-1.5 M1.1,0.6 L2.4,1.1'
  return (
    <G transform={glass.transform} opacity={opacity}>
      {angles.map((angle, i) => {
        const end = point(radius, angle)
        return <Line key={i} x1={0} y1={0} x2={end.x} y2={end.y} stroke={WEB} strokeWidth={0.5} />
      })}
      {arcs.map((d, i) => (
        <Path key={i} d={d} fill="none" stroke={WEB} strokeWidth={0.45} />
      ))}
      <Line x1={spider.x} y1={spider.y} x2={spider.x} y2={spider.y + 6} stroke={WEB} strokeWidth={0.4} />
      <G transform={`translate(${spider.x} ${spider.y + 7.4})`}>
        <Path d={legs} fill="none" stroke={PAPER} strokeWidth={0.4} />
        <Circle cx={0} cy={0} r={1.3} fill={PAPER} />
      </G>
    </G>
  )
}

/** One bat against the moon. Drawn outside every clip; a unit test keeps it inside the glass. */
export const FestiveOutside = memo(function FestiveOutside({
  festive,
  night,
}: {
  festive: Festive | null
  night: boolean
}) {
  if (festive !== 'halloween' || !night) return null
  const orb = skyOrbPoint()
  const { dx, dy } = HALLOWEEN_ANCHORS.moonBat
  return (
    <G id="festive-halloween-sky">
      <G transform={`translate(${orb.x + dx} ${orb.y + dy}) scale(1.15)`}>
        <Path d={BAT} fill={INK} opacity={0.8} />
      </G>
    </G>
  )
})

/** The wall dressing itself: garland, jack-o'-lantern, cobweb. Static, so no tick and no reduced motion. */
export const FestiveDecor = memo(function FestiveDecor({
  festive,
  phase,
}: {
  festive: Festive | null
  phase: SkyPhase
}) {
  if (festive !== 'halloween') return null
  const night = phase === 'night'
  const lit = night || phase === 'dusk'
  return (
    <G id="festive-halloween" opacity={night ? 0.9 : 1}>
      <PaperGarland />
      <G transform={leftWallTransform(HALLOWEEN_ANCHORS.lantern.gy, HALLOWEEN_ANCHORS.lantern.z)}>
        <JackOLantern lit={lit} />
      </G>
      <WindowCobweb night={night} />
    </G>
  )
})
