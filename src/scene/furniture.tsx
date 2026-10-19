import type { ReactNode } from 'react'
import {
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Polygon,
  Rect,
} from 'react-native-svg'
import { iso, isoPoints, floorPolygon, hashIndex, TILE_H, TILE_W } from './iso'
import { DESK_BENCHES, DESK_SEATS, type Seat } from './layout'
import { FURNITURE_FOOTPRINTS, type Box } from './footprints'
import { FURNITURE_BOUNDS, SOFA_SEGMENTS, SOFA_ARM_D } from './furniture-bounds'
import type { SceneItem } from './types'

type BoxColors = { top: string; left: string; right: string }

function Box({
  gx,
  gy,
  w,
  d,
  h,
  z0 = 0,
  colors,
  stroke,
  strokeOpacity = 0,
}: {
  gx: number
  gy: number
  w: number
  d: number
  h: number
  z0?: number
  colors: BoxColors
  stroke?: string
  strokeOpacity?: number
}) {
  const zt = z0 + h
  const top = isoPoints([
    [gx, gy, zt],
    [gx + w, gy, zt],
    [gx + w, gy + d, zt],
    [gx, gy + d, zt],
  ])
  const left = isoPoints([
    [gx, gy + d, zt],
    [gx + w, gy + d, zt],
    [gx + w, gy + d, z0],
    [gx, gy + d, z0],
  ])
  const right = isoPoints([
    [gx + w, gy + d, zt],
    [gx + w, gy, zt],
    [gx + w, gy, z0],
    [gx + w, gy + d, z0],
  ])
  return (
    <G>
      <Polygon points={left} fill={colors.left} />
      <Polygon points={right} fill={colors.right} />
      <Polygon
        points={top}
        fill={colors.top}
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeWidth={0.8}
      />
    </G>
  )
}

function Shadow({ gx, gy, rx, ry }: { gx: number; gy: number; rx: number; ry: number }) {
  const p = iso(gx, gy)
  return <Ellipse cx={p.x} cy={p.y + 2} rx={rx} ry={ry} fill="#0C0805" opacity={0.22} />
}

const WOOD = {
  top: '#C0895A',
  left: '#8A5F3A',
  right: '#6E4A2D',
  dark: '#46301E',
}
const METAL = { top: '#4A4741', left: '#36332E', right: '#2A2723' }
const SCREEN = { top: '#232A2A', left: '#151C1D', right: '#101617' }
const TEAL = { top: '#6C9488', left: '#52776B', right: '#3F5D54' }
const RUST = { top: '#C57D5E', left: '#9C6249', right: '#7F4E38' }
const CREAM = { top: '#E9DEC9', left: '#C9BCA4', right: '#B1A48C' }

const SOFA = FURNITURE_FOOTPRINTS.sofa

/** Sort bounds (footprint + height) for every key; see furniture-bounds.ts. */
const BOUNDS = FURNITURE_BOUNDS

/**
 * Every static drawable, with the 3D bounds the painter ordering in depth.ts needs. `occupied`
 * lights the monitors (typing). `seated` marks desks whose worker sprite draws its own chair
 * seat and back; those chairs render only their base here so the back is never drawn twice.
 */
export function buildFurniture(
  occupied: Set<number>,
  now: number,
  seated: Set<number> = occupied,
): SceneItem[] {
  const items: SceneItem[] = []
  const add = (key: string, node: ReactNode) => {
    const bounds = BOUNDS.get(key)
    if (!bounds) throw new Error(`furniture item ${key} has no sort bounds`)
    items.push({ key, bounds, node })
  }

  DESK_BENCHES.forEach((bench, index) => {
    add(`bench-${index}`, <DeskBench bench={bench} index={index} />)
  })

  DESK_SEATS.forEach((seat, index) => {
    // The monitor, keyboard and desk clutter are one unit on the bench top.
    const monitorBox = FURNITURE_FOOTPRINTS.monitors[index]
    add(
      `monitor-${index}`,
      <Monitor seat={seat} box={monitorBox} occupied={occupied.has(index)} now={now} index={index} />,
    )
    add(`chair-${index}`, <DeskChair seat={seat} index={index} occupied={seated.has(index)} />)
  })

  // The sofa is split into seat-sized slices (plus an arm at each end) so a character on one
  // seat orders against its own slice and its neighbours independently.
  for (let i = 0; i < SOFA_SEGMENTS; i++) add(`sofa-${i}`, <SofaSegment index={i} />)
  add('sofa-arm-back', <SofaArm gy={SOFA.gy} />)
  add('sofa-arm-front', <SofaArm gy={SOFA.gy + 2.83} />)

  const northArm = FURNITURE_FOOTPRINTS.armchairNorth
  const southArm = FURNITURE_FOOTPRINTS.armchairSouth
  const northOttoman = FURNITURE_FOOTPRINTS.ottomanNorth
  const southOttoman = FURNITURE_FOOTPRINTS.ottomanSouth

  add('armchair-1', <ArmchairBase box={northArm} />)
  add('armchair-1-back', <ArmchairBack box={northArm} />)
  add('armchair-2', <ArmchairBase box={southArm} />)
  add('armchair-2-back', <ArmchairBack box={southArm} />)
  add('coffee-table', <CoffeeTable now={now} />)
  add('ottoman-1', <Ottoman gy={northOttoman.gy} />)
  add('ottoman-2', <Ottoman gy={southOttoman.gy} />)
  add('window-bench', <WindowBench />)

  const beanbagColors = ['#C98A4B', '#5C8D80', '#B4654A', '#6E5A79']
  FURNITURE_FOOTPRINTS.beanbags.forEach((bag, i) => {
    add(
      `beanbag-${i + 1}`,
      <Beanbag gx={bag.gx + bag.w / 2} gy={bag.gy + bag.d / 2} color={beanbagColors[i]} />,
    )
  })

  FURNITURE_FOOTPRINTS.cushions.forEach((cushion, i) => {
    add(
      `cushion-${i + 1}`,
      <G transform={i === 0 ? 'translate(0 -20.5)' : undefined}>
        <Cushion box={cushion} />
      </G>,
    )
  })

  add('coffee-counter', <CoffeeCounter now={now} />)
  add('bookshelf', <Bookshelf />)
  add('floor-lamp', <FloorLamp now={now} />)

  FURNITURE_FOOTPRINTS.plantSpecs.forEach((spec, index) => {
    add(`plant-${index}`, <Plant box={spec.box} seed={spec.seed} />)
  })
  add('side-table', <SideTable />)

  return items
}

const BENCH_TOP_Z0 = 29
const BENCH_TOP_H = 4.5
const BENCH_LEG = 0.11
const BENCH_INSET = 0.07
/** The mid-span support sits between chairs 3 and 4 (gap in the seat row). */
const BENCH_MID_OFFSET = 3.55

/**
 * A slab on legs. Everything under the slab is drawn first, back to front (modesty panel, rear
 * legs, front legs), then the slab on top: the legs are inset from the slab edge, so the slab's
 * near faces correctly cover their tops. Every leg runs from the floor to the slab underside
 * (z 0 to 29), so nothing floats.
 */
function DeskBench({ bench, index }: { bench: (typeof DESK_BENCHES)[number]; index: number }) {
  void index
  const { gx, gy, w, d } = bench
  const left = gx + BENCH_INSET
  const right = gx + w - BENCH_INSET - BENCH_LEG
  const mid = gx + BENCH_MID_OFFSET - BENCH_LEG / 2
  const back = gy + BENCH_INSET
  const front = gy + d - BENCH_INSET - BENCH_LEG
  const leg = (x: number, y: number) => (
    <Box
      key={`${x}-${y}`}
      gx={x}
      gy={y}
      w={BENCH_LEG}
      d={BENCH_LEG}
      z0={0}
      h={BENCH_TOP_Z0}
      colors={METAL}
    />
  )
  return (
    <G>
      {/* soft contact shadow, offset away from the window light */}
      <Polygon
        points={floorPolygon(gx + 0.04, gy + 0.1, w + 0.12, d + 0.16)}
        fill="#0C0805"
        opacity={0.2}
      />
      {/* rear modesty panel, behind everything under the slab */}
      <Box
        gx={left + BENCH_LEG / 2}
        gy={back + 0.02}
        w={right - left}
        d={0.05}
        z0={11}
        h={BENCH_TOP_Z0 - 11}
        colors={{ top: '#6A4A30', left: '#4F3622', right: '#3F2B1A' }}
      />
      {leg(left, back)}
      {leg(mid, back)}
      {leg(right, back)}
      {leg(left, front)}
      {leg(mid, front)}
      {leg(right, front)}
      <Box
        gx={gx}
        gy={gy}
        w={w}
        d={d}
        z0={BENCH_TOP_Z0}
        h={BENCH_TOP_H}
        colors={WOOD}
        stroke="#C08B5D"
        strokeOpacity={0.4}
      />
    </G>
  )
}

const MONITOR_Z0 = BENCH_TOP_Z0 + BENCH_TOP_H

/**
 * Monitor, keyboard and clutter, all standing ON the bench top (z 33.5) inside the shared
 * monitor box. Back to front: lamp, stand foot, neck, panel, keyboard, mug.
 */
function Monitor({
  seat,
  box,
  occupied,
  now,
  index,
}: {
  seat: Seat
  box: Box
  occupied: boolean
  now: number
  index: number
}) {
  const cx = box.gx + box.w / 2
  const by = box.gy
  const panelGy = by + 0.18
  const panelD = 0.06
  const fy = panelGy + panelD
  const sx0 = cx - 0.39
  const sx1 = cx + 0.39
  const screenBottom = 47.5
  const screenTop = 65.5
  const s1 = iso(sx0, fy, screenBottom)
  const s2 = iso(sx1, fy, screenBottom)
  const s3 = iso(sx1, fy, screenTop)
  const s4 = iso(sx0, fy, screenTop)
  const p = (t: number, z: number) => iso(sx0 + t * (sx1 - sx0), fy, z)
  const lineColor = occupied ? '#8FE3D0' : '#46504F'

  const mug = iso(cx + 0.4, by + 0.34, MONITOR_Z0 + 5)
  const lampBase = { gx: cx - 0.4, gy: by + 0.2 }
  const lampTop = iso(lampBase.gx, lampBase.gy, MONITOR_Z0 + 22)
  const lampFoot = iso(lampBase.gx, lampBase.gy, MONITOR_Z0)
  return (
    <G>
      {index % 4 === 0 ? (
        <G>
          <Box
            gx={lampBase.gx - 0.07}
            gy={lampBase.gy - 0.07}
            w={0.14}
            d={0.14}
            z0={MONITOR_Z0}
            h={1.2}
            colors={METAL}
          />
          <Line
            x1={lampFoot.x}
            y1={lampFoot.y - 1}
            x2={lampTop.x}
            y2={lampTop.y}
            stroke="#4A453C"
            strokeWidth={1.6}
          />
          <Polygon
            points={`${iso(lampBase.gx - 0.12, lampBase.gy, MONITOR_Z0 + 21).x},${iso(lampBase.gx - 0.12, lampBase.gy, MONITOR_Z0 + 21).y} ${iso(lampBase.gx + 0.12, lampBase.gy, MONITOR_Z0 + 21).x},${iso(lampBase.gx + 0.12, lampBase.gy, MONITOR_Z0 + 21).y} ${iso(lampBase.gx + 0.07, lampBase.gy, MONITOR_Z0 + 28).x},${iso(lampBase.gx + 0.07, lampBase.gy, MONITOR_Z0 + 28).y} ${iso(lampBase.gx - 0.07, lampBase.gy, MONITOR_Z0 + 28).x},${iso(lampBase.gx - 0.07, lampBase.gy, MONITOR_Z0 + 28).y}`}
            fill="#E9C083"
          />
          <Circle cx={lampTop.x} cy={lampTop.y - 3} r={13} fill="#F3C57A" opacity={0.08} />
        </G>
      ) : null}
      {/* stand: foot plate, neck, then the panel */}
      <Box
        gx={cx - 0.16}
        gy={by + 0.1}
        w={0.32}
        d={0.22}
        z0={MONITOR_Z0}
        h={1.4}
        colors={{ top: '#3A3834', left: '#2A2824', right: '#211F1C' }}
      />
      <Box gx={cx - 0.04} gy={by + 0.2} w={0.08} d={0.06} z0={MONITOR_Z0 + 1.4} h={11} colors={METAL} />
      <Box
        gx={cx - 0.44}
        gy={panelGy}
        w={0.88}
        d={panelD}
        z0={45.5}
        h={22}
        colors={SCREEN}
        stroke="#101414"
        strokeOpacity={0.9}
      />
      <Polygon
        points={`${s1.x},${s1.y} ${s2.x},${s2.y} ${s3.x},${s3.y} ${s4.x},${s4.y}`}
        fill={occupied ? '#215052' : '#1A2223'}
        stroke="#0B1112"
        strokeWidth={1}
      />
      {occupied ? (
        <G>
          {[0, 1, 2, 3].map((i) => {
            const z = 62.6 - i * 3.9
            const a = p(0.08 + (i % 2) * 0.04, z)
            const b = p(0.55 + (i % 3) * 0.1, z)
            const opacity = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(now / 420 + i * 1.4))
            return (
              <Line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={lineColor}
                strokeWidth={1.6}
                opacity={opacity}
              />
            )
          })}
          <Line
            x1={p(0.66, 54).x}
            y1={p(0.66, 54).y}
            x2={p(0.82, 54).x}
            y2={p(0.82, 54).y}
            stroke="#E9A94C"
            strokeWidth={1.1}
            opacity={0.7}
          />
          <Line
            x1={p(0, 64.5 - ((now / 900) % 1) * 16).x}
            y1={p(0, 64.5 - ((now / 900) % 1) * 16).y}
            x2={p(0.96, 64.5 - ((now / 900) % 1) * 16).x}
            y2={p(0.96, 64.5 - ((now / 900) % 1) * 16).y}
            stroke="#8FE3D0"
            strokeWidth={1}
            opacity={0.32}
          />
          <Ellipse
            cx={(s1.x + s2.x) / 2}
            cy={s4.y + 12}
            rx={20}
            ry={15}
            fill="#63B9A8"
            opacity={0.09}
          />
        </G>
      ) : (
        <G>
          <Line
            x1={p(0.22, 59).x}
            y1={p(0.22, 59).y}
            x2={p(0.66, 59).x}
            y2={p(0.66, 59).y}
            stroke="#3A4747"
            strokeWidth={1.1}
            opacity={0.6}
          />
          <Line
            x1={p(0.3, 55).x}
            y1={p(0.3, 55).y}
            x2={p(0.58, 55).x}
            y2={p(0.58, 55).y}
            stroke="#3A4747"
            strokeWidth={1.1}
            opacity={0.35}
          />
        </G>
      )}

      {/* keyboard on the bench top, in front of the stand */}
      <Box
        gx={cx - 0.26}
        gy={by + 0.4}
        w={0.52}
        d={0.22}
        z0={MONITOR_Z0}
        h={1.5}
        colors={{ top: '#312C27', left: '#24201C', right: '#1C1916' }}
      />
      {[0, 1, 2].map((row) => {
        const y = by + 0.45 + row * 0.055
        const a = iso(cx - 0.22, y, MONITOR_Z0 + 1.6)
        const b = iso(cx + 0.22, y, MONITOR_Z0 + 1.6)
        return (
          <Line
            key={row}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#5C544A"
            strokeWidth={0.6}
            opacity={0.8}
          />
        )
      })}
      {index % 3 === 1 ? (
        <G>
          <Rect x={mug.x - 4} y={mug.y} width={8} height={5} rx={1.6} fill="#D9C9AF" />
          <Ellipse cx={mug.x} cy={mug.y} rx={4} ry={2.2} fill="#F1E4CE" />
        </G>
      ) : null}
    </G>
  )
}

/** Chair fabric for a desk index; the sprite reuses it so its chair-back overlay matches. */
export function chairFabric(index: number) {
  return index % 3 === 0 ? RUST : TEAL
}

const CHAIR_BACK = { gx: -0.21, gy: 0.17, w: 0.42, d: 0.08, z0: 18.5, h: 12 }
const CHAIR_SEAT = { gx: -0.26, gy: -0.18, w: 0.52, d: 0.36, z0: 14, h: 4.5 }

type LocalPoint = { x: number; y: number }

function chairLocal(gxOff: number, gyOff: number, z: number): LocalPoint {
  return { x: (gxOff - gyOff) * (TILE_W / 2), y: (gxOff + gyOff) * (TILE_H / 2) - z }
}

/**
 * The chair-back faces in sprite-local coordinates (feet at 0,0), so a seated worker drawn
 * from behind can lay the same chair in front of its lower back.
 */
export const CHAIR_BACK_LOCAL = (() => {
  const { gx, gy, w, d, z0, h } = CHAIR_BACK
  const top = h + z0
  const a = chairLocal(gx, gy, top)
  const b = chairLocal(gx + w, gy, top)
  const c = chairLocal(gx + w, gy + d, top)
  const dd = chairLocal(gx, gy + d, top)
  const a0 = chairLocal(gx, gy + d, z0)
  const c0 = chairLocal(gx + w, gy + d, z0)
  const b0 = chairLocal(gx + w, gy, z0)
  const pts = (p: LocalPoint[]) => p.map((q) => `${q.x},${q.y}`).join(' ')
  return {
    top: pts([a, b, c, dd]),
    left: pts([dd, c, c0, a0]),
    right: pts([c, b, b0, c0]),
    edge: { x1: c.x, y1: c.y, x2: c0.x, y2: c0.y },
    highlight: {
      x1: chairLocal(gx + 0.05, gy + d, z0 + h - 3).x,
      y1: chairLocal(gx + 0.05, gy + d, z0 + h - 3).y,
      x2: chairLocal(gx + 0.3, gy + d, z0 + h - 3).x,
      y2: chairLocal(gx + 0.3, gy + d, z0 + h - 3).y,
    },
    shoulder: dd,
  }
})()

/** Seat cushion faces of the desk chair, for the seated-from-behind sprite. */
export const CHAIR_SEAT_LOCAL = (() => {
  const { gx, gy, w, d, z0, h } = CHAIR_SEAT
  const top = z0 + h
  const a = chairLocal(gx, gy, top)
  const b = chairLocal(gx + w, gy, top)
  const c = chairLocal(gx + w, gy + d, top)
  const dd = chairLocal(gx, gy + d, top)
  const a0 = chairLocal(gx, gy + d, z0)
  const c0 = chairLocal(gx + w, gy + d, z0)
  const b0 = chairLocal(gx + w, gy, z0)
  const pts = (p: LocalPoint[]) => p.map((q) => `${q.x},${q.y}`).join(' ')
  return {
    top: pts([a, b, c, dd]),
    front: pts([dd, c, c0, a0]),
    side: pts([c, b, b0, c0]),
  }
})()

/**
 * Desk chair, drawn from behind. It is pushed in toward the bench with its back on the viewer
 * side (+gy), and the back is kept low (top z 30.5) so a worker's shoulders and head stay clear.
 *
 * Ownership of the chair seat and back: an EMPTY chair is drawn here in full. When someone sits
 * in it (`occupied`), this component draws only the base (shadow, casters, star base, post) and
 * the worker sprite draws the seat and the back itself from CHAIR_SEAT_LOCAL / CHAIR_BACK_LOCAL,
 * which are derived from the same CHAIR_SEAT / CHAIR_BACK geometry. Exactly one of the two draws
 * the back, so it is never doubled, and the back always lands in front of the worker's lower
 * back because it is part of the sprite.
 */
function DeskChair({ seat, index, occupied }: { seat: Seat; index: number; occupied: boolean }) {
  const fabric = chairFabric(index)
  const { gx, gy } = seat
  const caster = (x: number, y: number) => (
    <Box key={`${x}-${y}`} gx={x - 0.04} gy={y - 0.04} w={0.08} d={0.08} z0={0} h={2.2} colors={METAL} />
  )
  return (
    <G>
      <Shadow gx={gx} gy={gy + 0.05} rx={19} ry={8} />
      {caster(gx, gy - 0.23)}
      {caster(gx - 0.23, gy)}
      {caster(gx + 0.23, gy)}
      {caster(gx, gy + 0.23)}
      <Box gx={gx - 0.23} gy={gy - 0.03} w={0.46} d={0.06} z0={2.2} h={1.2} colors={METAL} />
      <Box gx={gx - 0.03} gy={gy - 0.23} w={0.06} d={0.46} z0={2.2} h={1.2} colors={METAL} />
      <Box gx={gx - 0.035} gy={gy - 0.035} w={0.07} d={0.07} z0={3.4} h={CHAIR_SEAT.z0 - 3.4} colors={METAL} />
      {occupied ? null : (
        <G>
          <Box
            gx={gx + CHAIR_SEAT.gx}
            gy={gy + CHAIR_SEAT.gy}
            w={CHAIR_SEAT.w}
            d={CHAIR_SEAT.d}
            z0={CHAIR_SEAT.z0}
            h={CHAIR_SEAT.h}
            colors={fabric}
          />
          <Box
            gx={gx + CHAIR_BACK.gx}
            gy={gy + CHAIR_BACK.gy}
            w={CHAIR_BACK.w}
            d={CHAIR_BACK.d}
            z0={CHAIR_BACK.z0}
            h={CHAIR_BACK.h}
            colors={fabric}
            stroke="#2A2119"
            strokeOpacity={0.4}
          />
          <Rect
            x={iso(gx - 0.14, gy + CHAIR_BACK.gy + CHAIR_BACK.d, CHAIR_BACK.z0 + CHAIR_BACK.h - 3).x}
            y={iso(gx - 0.14, gy + CHAIR_BACK.gy + CHAIR_BACK.d, CHAIR_BACK.z0 + CHAIR_BACK.h - 3).y}
            width={9}
            height={1.2}
            rx={0.6}
            fill="#F4EDE0"
            opacity={0.18}
          />
        </G>
      )}
    </G>
  )
}

/** Corner posts are painted rear-to-front, then capped by the slab. */
function Legs({ box, height, colors = WOOD }: { box: Box; height: number; colors?: BoxColors }) {
  const { gx, gy, w, d } = box
  return <G>{[[0.07, 0.07], [w - 0.16, 0.07], [0.07, d - 0.16], [w - 0.16, d - 0.16]].map(([x, y], i) => (
    <Box key={i} gx={gx + x} gy={gy + y} w={0.09} d={0.09} h={height} colors={colors} />
  ))}</G>
}

/** Soft floor pouf, with a shaded lower welt and a gently domed top. */
function SoftSeat({ box, z = 0, h, color }: { box: Box; z?: number; h: number; color: string }) {
  const { gx, gy, w, d } = box
  const p = iso(gx + w / 2, gy + d / 2, z)
  const rx = (w + d) * 16 * 0.65
  const ry = Math.min(Math.min(w, d) * 16 * 0.7, h * 0.32)
  return <G>
    <Ellipse cx={p.x} cy={p.y - ry} rx={rx} ry={ry} fill={color} />
    <Ellipse cx={p.x} cy={p.y - ry} rx={rx} ry={ry} fill="#24170E" opacity={0.2} />
    <Ellipse cx={p.x} cy={p.y - h + ry} rx={rx * 0.94} ry={ry} fill={color} stroke="#F3DEC0" strokeOpacity={0.2} strokeWidth={0.7} />
    <Ellipse cx={p.x - rx * 0.15} cy={p.y - h + ry - 1} rx={rx * 0.54} ry={ry * 0.55} fill="#FFFFFF" opacity={0.07} />
  </G>
}

function SofaSegment({ index }: { index: number }) {
  const { gx, gy, w, d } = SOFA
  const segD = (d - 2 * SOFA_ARM_D) / SOFA_SEGMENTS
  const segGy = gy + SOFA_ARM_D + index * segD
  const cushionGy = segGy + 0.04
  return (
    <G>
      {index === 1 ? <Shadow gx={gx + 0.5} gy={gy + 1.5} rx={50} ry={22} /> : null}
      <Box gx={gx} gy={segGy} w={w} d={segD} z0={0} h={20} colors={TEAL} />
      <Box
        gx={gx}
        gy={segGy}
        w={0.24}
        d={segD}
        z0={20}
        h={27}
        colors={{ top: '#5C8378', left: '#416158', right: '#334D46' }}
      />
      <Box
        gx={gx + 0.24}
        gy={cushionGy}
        w={0.76}
        d={segD - 0.08}
        z0={20}
        h={5}
        colors={{ top: '#6A9285', left: '#527A6E', right: '#42655B' }}
      />
      {index === 0 ? (
        <Box
          gx={gx + 0.2}
          gy={gy + 0.32}
          w={0.38}
          d={0.32}
          z0={25}
          h={9}
          colors={{ top: '#D19A5B', left: '#B07C42', right: '#936432' }}
        />
      ) : null}
      {index === 2 ? (
        <Box
          gx={gx + 0.2}
          gy={gy + 2.48}
          w={0.38}
          d={0.32}
          z0={25}
          h={9}
          colors={{ top: '#C9B08B', left: '#A9916E', right: '#8F7859' }}
        />
      ) : null}
    </G>
  )
}

function SofaArm({ gy }: { gy: number }) {
  return (
    <Box
      gx={SOFA.gx}
      gy={gy}
      w={SOFA.w}
      d={SOFA_ARM_D}
      z0={0}
      h={45}
      colors={{ top: '#5C8378', left: '#45685E', right: '#355249' }}
    />
  )
}

function ArmchairBase({ box }: { box: Box }) {
  const { gx, gy, w, d } = box
  return (
    <G>
      <Shadow gx={gx + w / 2} gy={gy + d / 2} rx={34} ry={18} />
      <Box gx={gx} gy={gy} w={w - 0.12} d={d} z0={0} h={20} colors={RUST} />
      <Box
        gx={gx}
        gy={gy}
        w={w - 0.12}
        d={0.15}
        z0={20}
        h={22}
        colors={{ top: '#B26C4E', left: '#8D543D', right: '#71432F' }}
      />
      <Box
        gx={gx + 0.08}
        gy={gy + 0.1}
        w={w - 0.22}
        d={d - 0.2}
        z0={20}
        h={5}
        colors={{ top: '#C47D5C', left: '#A06045', right: '#854B34' }}
      />
      <Box
        gx={gx}
        gy={gy + d - 0.15}
        w={w - 0.12}
        d={0.15}
        z0={20}
        h={22}
        colors={{ top: '#B26C4E', left: '#8D543D', right: '#71432F' }}
      />
    </G>
  )
}

function ArmchairBack({ box }: { box: Box }) {
  return (
    <Box
      gx={box.gx + box.w - 0.12}
      gy={box.gy}
      w={0.12}
      d={box.d}
      z0={20}
      h={30}
      colors={{ top: '#B26C4E', left: '#8D543D', right: '#6B3F2C' }}
      stroke="#5B3424"
      strokeOpacity={0.4}
    />
  )
}

function CoffeeTable({ now }: { now: number }) {
  const { gx, gy, w, d } = FURNITURE_FOOTPRINTS.coffeeTable
  const x = iso(gx + 0.8, gy + 0.55, 26.5)
  return (
    <G>
      <Shadow gx={gx + 0.8} gy={gy + 0.55} rx={40} ry={18} />
      <Legs box={{ gx, gy, w, d }} height={18} />
      <Box gx={gx} gy={gy} w={w} d={d} z0={18} h={4.5} colors={WOOD} stroke="#C08B5D" strokeOpacity={0.4} />
      {/* books */}
      <Box gx={gx + 0.25} gy={gy + 0.25} w={0.42} d={0.28} z0={22.5} h={2.2} colors={{ top: '#B4553A', left: '#8D3E2A', right: '#713020' }} />
      <Box gx={gx + 0.3} gy={gy + 0.27} w={0.38} d={0.25} z0={24.7} h={2.1} colors={{ top: '#E9DEC9', left: '#C9BCA4', right: '#B1A48C' }} />
      {/* mug */}
      <G>
        <Ellipse cx={x.x} cy={x.y} rx={4.5} ry={2.4} fill="#F1E4CE" />
        <Rect x={x.x - 4.5} y={x.y} width={9} height={4} rx={2} fill="#D9C9AF" />
      </G>
      {/* small terracotta planter stands on the tabletop */}
      <Box gx={gx + w - 0.3} gy={gy + 0.62} w={0.16} d={0.16} z0={22.5} h={5} colors={RUST} />
      <Circle cx={iso(gx + w - 0.22, gy + 0.7, 30).x} cy={iso(gx + w - 0.22, gy + 0.7, 30).y} r={4} fill="#5F8A55" />
      {/* steam from mug */}
      <Path
        d={`M ${x.x} ${x.y - 5} q 2 -3 0 -5 q -2 -2 0 -4`}
        stroke="#F4EDE0"
        strokeWidth={1}
        fill="none"
        opacity={0.14 + 0.08 * Math.sin(now / 700)}
      />
    </G>
  )
}

function Ottoman({ gy }: { gy: number }) {
  const gx = FURNITURE_FOOTPRINTS.ottomanNorth.gx
  return (
    <G>
      <Shadow gx={gx + 0.42} gy={gy + 0.3} rx={24} ry={12} />
      <SoftSeat box={{ gx, gy, w: 0.84, d: 0.58 }} h={19} color="#C6A471" />
      <Line
        x1={iso(gx + 0.1, gy + 0.3, 19.4).x}
        y1={iso(gx + 0.1, gy + 0.3, 19.4).y}
        x2={iso(gx + 0.74, gy + 0.3, 19.4).x}
        y2={iso(gx + 0.74, gy + 0.3, 19.4).y}
        stroke="#B08D5A"
        strokeWidth={0.8}
        opacity={0.7}
      />
    </G>
  )
}

function WindowBench() {
  const { gx, gy, w, d } = FURNITURE_FOOTPRINTS.windowBench
  return (
    <G>
      <Shadow gx={gx + 1.0} gy={gy + 0.5} rx={46} ry={18} />
      <Legs box={{ gx, gy, w, d }} height={11} />
      <Box gx={gx} gy={gy} w={w} d={d} z0={11} h={3} colors={WOOD} />
      <Box gx={gx + 0.04} gy={gy + 0.04} w={w - 0.08} d={d - 0.08} z0={14} h={5} colors={{ top: '#D8C29B', left: '#B9A27C', right: '#9C8662' }} />
      {[0, 1].map((i) => (
        <Box
          key={i}
          gx={gx + 0.18 + i * 0.92}
          gy={gy + 0.1}
          w={0.62}
          d={0.38}
          z0={19}
          h={4}
          colors={{ top: i === 0 ? '#C98A4B' : '#5C8D80', left: '#9F6D3C', right: '#84582F' }}
        />
      ))}
    </G>
  )
}

function Beanbag({ gx, gy, color }: { gx: number; gy: number; color: string }) {
  return <G>
    <Shadow gx={gx} gy={gy} rx={21} ry={9} />
    <SoftSeat box={{ gx: gx - 0.35, gy: gy - 0.35, w: 0.7, d: 0.7 }} h={16} color={color} />
  </G>
}

function Cushion({ box }: { box: Box }) {
  const gx = box.gx + box.w / 2
  const gy = box.gy + box.d / 2
  const p = iso(gx, gy, 6)
  return <G>
    <Shadow gx={gx} gy={gy} rx={17} ry={7} />
    <SoftSeat box={box} h={6} color="#C9B08B" />
    <Ellipse cx={p.x} cy={p.y + 4} rx={1.2} ry={0.6} fill="#8C7658" />
  </G>
}

function CoffeeCounter({ now }: { now: number }) {
  const { gx, gy, w, d } = FURNITURE_FOOTPRINTS.coffeeCounter
  const machineGlow = iso(12.55, 0.78, 58)
  return (
    <G>
      <Shadow gx={gx + 1.5} gy={gy + 0.5} rx={54} ry={16} />
      <Box gx={gx} gy={gy} w={w} d={d} z0={0} h={32} colors={{ top: '#E8DDC9', left: '#7B5636', right: '#634428' }} />
      <Box gx={gx} gy={gy} w={w} d={d} z0={32} h={4} colors={CREAM} stroke="#F4EDE0" strokeOpacity={0.5} />
      {[0, 1, 2].map((i) => <G key={i}>
        <Polygon points={isoPoints([[gx + 0.08 + i * 1.0, gy + d, 3], [gx + 0.98 + i * 1.0, gy + d, 3], [gx + 0.98 + i * 1.0, gy + d, 29], [gx + 0.08 + i * 1.0, gy + d, 29]])} fill="#9A6B43" stroke="#543922" strokeWidth={0.6} />
        <Polygon points={isoPoints([[gx + 0.35 + i, gy + d + 0.002, 24], [gx + 0.65 + i, gy + d + 0.002, 24], [gx + 0.65 + i, gy + d + 0.002, 22.5], [gx + 0.35 + i, gy + d + 0.002, 22.5]])} fill="#3A291A" />
      </G>)}
      {/* coffee machine */}
      <Box gx={12.18} gy={0.55} w={0.6} d={0.42} z0={36} h={21} colors={{ top: '#3B3A37', left: '#292826', right: '#1F1E1C' }} />
      <Rect
        x={iso(12.3, 0.97, 50).x}
        y={iso(12.3, 0.97, 50).y}
        width={8}
        height={3}
        rx={1}
        fill="#E9A94C"
        opacity={0.75}
      />
      <Circle cx={iso(12.68, 0.97, 53).x} cy={iso(12.68, 0.97, 53).y} r={1.4} fill="#D97757" />
      <Ellipse
        cx={iso(12.42, 0.97, 41).x}
        cy={iso(12.42, 0.97, 41).y}
        rx={5}
        ry={3}
        fill="#6B5A4A"
      />
      <Ellipse
        cx={iso(12.42, 0.97, 41).x}
        cy={iso(12.42, 0.97, 41).y}
        rx={3}
        ry={1.7}
        fill="#3A2A1D"
      />
      <Circle cx={machineGlow.x} cy={machineGlow.y} r={16} fill="#F3C57A" opacity={0.05} />
      {[0, 1].map((i) => (
        <Path
          key={i}
          d={`M ${iso(12.3 + i * 0.17, 0.72, 58).x} ${iso(12.3 + i * 0.17, 0.72, 58).y} q 3 -5 0 -9 q -3 -4 0 -8`}
          stroke="#F4EDE0"
          strokeWidth={1.1}
          fill="none"
          opacity={0.12 + 0.08 * Math.sin(now / 800 + i)}
        />
      ))}
      {/* cups + jar */}
      {[0, 1, 2].map((i) => (
        <G key={i}>
          <Ellipse cx={iso(11.0 + i * 0.25, 0.86, 40).x} cy={iso(11.0 + i * 0.25, 0.86, 40).y} rx={3.4} ry={1.8} fill="#F4EDE0" />
          <Rect
            x={iso(11.0 + i * 0.25, 0.86, 40).x - 3.4}
            y={iso(11.0 + i * 0.25, 0.86, 40).y}
            width={6.8}
            height={4}
            rx={1.6}
            fill={i === 1 ? '#D97757' : '#D9C9AF'}
          />
        </G>
      ))}
      <Rect
        x={iso(10.55, 0.86, 40).x - 5}
        y={iso(10.55, 0.86, 40).y - 10}
        width={10}
        height={11}
        rx={2}
        fill="#8FA3B8"
        opacity={0.7}
      />
    </G>
  )
}

function Bookshelf() {
  const { gx, gy, w, d } = FURNITURE_FOOTPRINTS.bookshelf
  const timber = { top: '#99704A', left: '#795333', right: '#573920' }
  const books = ['#B4553A', '#5C8D80', '#D3A85F', '#6E5A79', '#8DA37E', '#C9B08B']
  return <G>
    <Shadow gx={gx + w / 2} gy={gy + d / 2} rx={30} ry={13} />
    {/* Back panel, open toward +gx; shelves and spines are actual iso volumes. */}
    <Box gx={gx} gy={gy} w={0.07} d={d} h={92} colors={{ top: '#795333', left: '#4A3120', right: '#3B2618' }} />
    <Box gx={gx} gy={gy} w={w} d={0.07} h={92} colors={timber} />
    {[0, 1, 2, 3].map((row) => {
      const z = 4 + row * 21
      return <G key={row}>
        <Box gx={gx + 0.07} gy={gy + 0.07} w={w - 0.07} d={d - 0.14} z0={z} h={2.5} colors={timber} />
        {books.map((color, i) => <Box key={i} gx={gx + 0.16} gy={gy + 0.14 + i * 0.21} w={w - 0.19} d={0.14} z0={z + 2.5} h={12 + (i + row) % 4} colors={{ top: color, left: color, right: color }} />)}
      </G>
    })}
    <Box gx={gx} gy={gy + d - 0.07} w={w} d={0.07} h={92} colors={timber} />
    <Box gx={gx} gy={gy} w={w} d={d} z0={89} h={3} colors={timber} />
  </G>
}

function FloorLamp({ now }: { now: number }) {
  const { gx, gy, w, d } = FURNITURE_FOOTPRINTS.floorLamp
  const base = iso(gx + w / 2, gy + d / 2)
  const shadeY = base.y - 70
  return (
    <G>
      <Ellipse cx={base.x} cy={base.y + 1} rx={13} ry={6} fill="#0C0805" opacity={0.22} />
      <Box gx={gx} gy={gy} w={w} d={d} h={2} colors={METAL} />
      <Line x1={base.x} y1={base.y - 2} x2={base.x} y2={shadeY} stroke="#6B5B48" strokeWidth={2} />
      <Polygon
        points={`${base.x - 15},${shadeY + 12} ${base.x + 15},${shadeY + 12} ${base.x + 9},${shadeY - 8} ${base.x - 9},${shadeY - 8}`}
        fill="#E9C083"
      />
      <Polygon
        points={`${base.x - 15},${shadeY + 12} ${base.x + 15},${shadeY + 12} ${base.x + 9},${shadeY - 8} ${base.x - 9},${shadeY - 8}`}
        fill="#F3C57A"
        opacity={0.2 + 0.04 * Math.sin(now / 900)}
      />
      <Polygon points={`${base.x},${shadeY - 8} ${base.x + 9},${shadeY - 8} ${base.x + 15},${shadeY + 12} ${base.x},${shadeY + 12}`} fill="#A97E49" opacity={0.22} />
      <Ellipse cx={base.x} cy={shadeY + 15} rx={14} ry={3} fill="#FFE3A5" opacity={0.35} />
    </G>
  )
}

function Plant({ box, seed }: { box: Box; seed: number }) {
  const gx = box.gx + box.w / 2
  const gy = box.gy + box.d / 2
  const scale = box.w / 0.48
  const p = iso(gx, gy)
  const leaves = Array.from({ length: 7 }).map((_, i) => {
    const angle = -70 + i * 23 + (seed % 3) * 5
    const len = 15 + hashIndex(`p${seed}`, i, 10)
    const topX = p.x + Math.cos((angle * Math.PI) / 180) * len * scale
    const topY = p.y - 30 * scale - Math.sin(((angle + 20) * Math.PI) / 180) * len * scale
    return { angle, len, topX, topY, color: i % 3 === 0 ? '#3D6540' : i % 3 === 1 ? '#5F8A55' : '#7BA36B' }
  })
  return (
    <G>
      <Shadow gx={gx} gy={gy} rx={16 * scale} ry={7 * scale} />
      <Box
        gx={gx - 0.24 * scale}
        gy={gy - 0.24 * scale}
        w={0.48 * scale}
        d={0.48 * scale}
        z0={0}
        h={18 * scale}
        colors={{ top: '#C07950', left: '#9E5C3B', right: '#854A2E' }}
      />
      <Ellipse cx={p.x} cy={p.y - 18 * scale} rx={9 * scale} ry={3.6 * scale} fill="#3A2A1D" opacity={0.55} />
      {leaves.map((leaf, i) => (
        <G key={i}>
          <Line
            x1={p.x}
            y1={p.y - 18 * scale}
            x2={leaf.topX}
            y2={leaf.topY}
            stroke="#4C6B3E"
            strokeWidth={1.2 * scale}
          />
          <Ellipse
            cx={leaf.topX}
            cy={leaf.topY}
            rx={4.6 * scale}
            ry={8.5 * scale}
            fill={leaf.color}
            opacity={0.95}
          />
        </G>
      ))}
    </G>
  )
}

function SideTable() {
  const { gx, gy, w, d } = FURNITURE_FOOTPRINTS.sideTable
  return (
    <G>
      <Shadow gx={gx + 0.3} gy={gy + 0.3} rx={18} ry={9} />
      <Legs box={{ gx, gy, w, d }} height={17} colors={METAL} />
      <Box gx={gx} gy={gy} w={w} d={d} z0={17} h={3.5} colors={WOOD} />
    </G>
  )
}
