import type { ReactNode } from 'react'
import {
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg'
import { iso, isoPoints, hashIndex, TILE_H, TILE_W } from './iso'
import { DESK_BENCHES, DESK_SEATS, type Seat } from './layout'
import { FURNITURE_FOOTPRINTS, type Box } from './footprints'
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

/** Painter depth for an axis-aligned footprint: its front (max gx+gy) corner. */
function frontDepth(gx: number, gy: number, w: number, d: number): number {
  return gx + w + gy + d
}

const SOFA = FURNITURE_FOOTPRINTS.sofa
const SOFA_SEGMENTS = 3

export function buildFurniture(occupied: Set<number>, now: number): SceneItem[] {
  const items: SceneItem[] = []
  const add = (key: string, depth: number, node: ReactNode) =>
    items.push({ key, depth, node })

  DESK_BENCHES.forEach((bench, index) => {
    add(
      `bench-${index}`,
      bench.gx + bench.gy,
      <G>
        <Shadow gx={bench.gx + bench.w / 2 - 0.1} gy={bench.gy + bench.d / 2} rx={105} ry={24} />
        <DeskBench bench={bench} index={index} />
      </G>,
    )
  })

  DESK_SEATS.forEach((seat, index) => {
    // The monitor, keyboard and desk clutter are one unit. Its full footprint includes
    // the keyboard sitting just behind the worker at this seat.
    const monitorBox = FURNITURE_FOOTPRINTS.monitors[index]
    const chairBox = FURNITURE_FOOTPRINTS.chairs[index]
    add(
      `monitor-${index}`,
      frontDepth(monitorBox.gx, monitorBox.gy, monitorBox.w, monitorBox.d),
      <Monitor seat={seat} box={monitorBox} occupied={occupied.has(index)} now={now} index={index} />,
    )
    add(
      `chair-${index}`,
      frontDepth(chairBox.gx + 0.07, chairBox.gy + 0.36, 0.46, 0.09),
      <DeskChair seat={seat} index={index} />,
    )
  })

  // Split the sofa into seat-sized slices so each seated character can draw just
  // after its own cushion, instead of behind the whole three-seat body.
  const sofaSegD = SOFA.d / SOFA_SEGMENTS
  for (let i = 0; i < SOFA_SEGMENTS; i++) {
    const gy0 = SOFA.gy + i * sofaSegD
    const cushionGy = SOFA.gy + 0.42 + i * 0.92
    const depth = Math.max(
      frontDepth(SOFA.gx, gy0, SOFA.w, sofaSegD),
      frontDepth(SOFA.gx, gy0, 0.24, sofaSegD),
      frontDepth(SOFA.gx + 0.25, cushionGy, 0.7, 0.78),
      i === 0 ? frontDepth(SOFA.gx + 0.2, SOFA.gy + 0.32, 0.38, 0.32) : 0,
      i === 2 ? frontDepth(SOFA.gx + 0.2, SOFA.gy + 2.48, 0.38, 0.32) : 0,
    )
    add(`sofa-${i}`, depth, <SofaSegment index={i} />)
  }
  add(
    'sofa-arm-back',
    frontDepth(SOFA.gx, SOFA.gy, SOFA.w, 0.22),
    <SofaArm gy={SOFA.gy} />,
  )
  add(
    'sofa-arm-front',
    frontDepth(SOFA.gx, SOFA.gy + 2.83, SOFA.w, 0.22),
    <SofaArm gy={SOFA.gy + 2.83} />,
  )

  const northArm = FURNITURE_FOOTPRINTS.armchairNorth
  const southArm = FURNITURE_FOOTPRINTS.armchairSouth
  const coffeeTable = FURNITURE_FOOTPRINTS.coffeeTable
  const northOttoman = FURNITURE_FOOTPRINTS.ottomanNorth
  const southOttoman = FURNITURE_FOOTPRINTS.ottomanSouth
  const windowBench = FURNITURE_FOOTPRINTS.windowBench
  const coffeeCounter = FURNITURE_FOOTPRINTS.coffeeCounter
  const bookshelf = FURNITURE_FOOTPRINTS.bookshelf
  const sideTable = FURNITURE_FOOTPRINTS.sideTable
  const lamp = FURNITURE_FOOTPRINTS.floorLamp

  add('armchair-1', frontDepth(northArm.gx, northArm.gy, northArm.w, northArm.d), <ArmchairBase box={northArm} />)
  add('armchair-1-back', frontDepth(northArm.gx + northArm.w - 0.12, northArm.gy, 0.12, northArm.d), <ArmchairBack box={northArm} />)
  add('armchair-2', frontDepth(southArm.gx, southArm.gy, southArm.w, southArm.d), <ArmchairBase box={southArm} />)
  add('armchair-2-back', frontDepth(southArm.gx + southArm.w - 0.12, southArm.gy, 0.12, southArm.d), <ArmchairBack box={southArm} />)
  add('coffee-table', frontDepth(coffeeTable.gx, coffeeTable.gy, coffeeTable.w, coffeeTable.d), <CoffeeTable now={now} />)
  add('ottoman-1', frontDepth(northOttoman.gx, northOttoman.gy, northOttoman.w, northOttoman.d), <Ottoman gy={northOttoman.gy} />)
  add('ottoman-2', frontDepth(southOttoman.gx, southOttoman.gy, southOttoman.w, southOttoman.d), <Ottoman gy={southOttoman.gy} />)
  add('window-bench', frontDepth(windowBench.gx, windowBench.gy, windowBench.w, windowBench.d), <WindowBench />)

  const beanbagColors = ['#C98A4B', '#5C8D80', '#B4654A', '#6E5A79']
  FURNITURE_FOOTPRINTS.beanbags.forEach((bag, i) => {
    const gx = bag.gx + bag.w / 2
    const gy = bag.gy + bag.d / 2
    add(`beanbag-${i + 1}`, gx + gy + 0.4, <Beanbag gx={gx} gy={gy} color={beanbagColors[i]} />)
  })

  FURNITURE_FOOTPRINTS.cushions.forEach((cushion, i) => {
    const gx = cushion.gx + cushion.w / 2
    const gy = cushion.gy + cushion.d / 2
    add(`cushion-${i + 1}`, frontDepth(cushion.gx, cushion.gy, cushion.w, cushion.d), <Cushion gx={gx} gy={gy} />)
  })

  add('coffee-counter', frontDepth(coffeeCounter.gx, coffeeCounter.gy, coffeeCounter.w, coffeeCounter.d), <CoffeeCounter now={now} />)
  add('bookshelf', frontDepth(bookshelf.gx, bookshelf.gy, bookshelf.w, bookshelf.d), <Bookshelf />)
  add('floor-lamp', lamp.gx + lamp.w / 2 + lamp.gy + lamp.d / 2 + 0.3, <FloorLamp now={now} />)

  FURNITURE_FOOTPRINTS.plantSpecs.forEach((spec, index) => {
    const { box, seed } = spec
    const gx = box.gx + box.w / 2
    const gy = box.gy + box.d / 2
    add(`plant-${index}`, gx + gy + 0.5 * spec.scale, <Plant box={box} seed={seed} />)
  })
  add('side-table', frontDepth(sideTable.gx, sideTable.gy, sideTable.w, sideTable.d), <SideTable />)

  return items
}

function DeskBench({ bench, index }: { bench: (typeof DESK_BENCHES)[number]; index: number }) {
  const { gx, gy, w, d } = bench
  return (
    <G>
      <Box gx={gx} gy={gy} w={w} d={d} z0={29} h={4.5} colors={WOOD} stroke="#C08B5D" strokeOpacity={0.4} />
      <Box gx={gx + 0.08} gy={gy + 0.12} w={0.14} d={0.14} z0={0} h={29} colors={METAL} />
      <Box gx={gx + w - 0.22} gy={gy + 0.12} w={0.14} d={0.14} z0={0} h={29} colors={METAL} />
      <Box gx={gx + 0.08} gy={gy + d - 0.26} w={0.14} d={0.14} z0={0} h={29} colors={METAL} />
      <Box gx={gx + w - 0.22} gy={gy + d - 0.26} w={0.14} d={0.14} z0={0} h={29} colors={METAL} />
      <Box
        gx={gx + 0.35}
        gy={gy + 0.2}
        w={w - 0.7}
        d={0.12}
        z0={14}
        h={2.4}
        colors={{ top: '#7D5738', left: '#5C3D26', right: '#4C321E' }}
      />
      {/* under-desk paper tray */}
      <Box
        gx={gx + 2.2}
        gy={gy + 0.25}
        w={0.55}
        d={0.35}
        z0={20}
        h={4}
        colors={{ top: '#D8CBB4', left: '#B7A88E', right: '#9A8B73' }}
      />
      <Box
        gx={gx + 3.9}
        gy={gy + 0.28}
        w={0.36}
        d={0.3}
        z0={21}
        h={6}
        colors={{ top: '#55483C', left: '#3C332B', right: '#2E2620' }}
      />
      {index === 0 ? (
        <G>
          <Rect x={iso(gx + 1.0, gy + 0.48).x} y={iso(gx + 1.0, gy + 0.48).y - 36} width={22} height={3} rx={1.5} fill="#E9A94C" opacity={0.5} />
        </G>
      ) : null}
    </G>
  )
}

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
  const monitorBox = box
  const gy = monitorBox.gy
  const gx = monitorBox.gx
  const frontGy = gy + 0.06
  const screenBottom = 48
  const screenTop = 68
  const sx1 = iso(gx, frontGy, screenBottom)
  const sx2 = iso(gx + 0.9, frontGy, screenBottom)
  const st2 = iso(gx + 0.9, frontGy, screenTop)
  const st1 = iso(gx, frontGy, screenTop)
  const p = (t: number, z: number) => iso(gx + 0.05 + t * 0.8, frontGy, z)

  const lineColor = occupied ? '#8FE3D0' : '#46504F'
  return (
    <G>
      <Box
        gx={gx + 0.36}
        gy={gy + 0.04}
        w={0.18}
        d={0.18}
        z0={33.5}
        h={8}
        colors={METAL}
      />
      <Box
        gx={gx + 0.12}
        gy={gy + 0.16}
        w={0.66}
        d={0.16}
        z0={33.5}
        h={1.4}
        colors={{ top: '#3A3834', left: '#2A2824', right: '#211F1C' }}
      />
      <Box
        gx={gx}
        gy={gy}
        w={0.9}
        d={0.07}
        z0={46}
        h={23}
        colors={SCREEN}
        stroke="#101414"
        strokeOpacity={0.9}
      />
      <Polygon
        points={`${sx1.x},${sx1.y} ${sx2.x},${sx2.y} ${st2.x},${st2.y} ${st1.x},${st1.y}`}
        fill={occupied ? '#215052' : '#1A2223'}
        stroke="#0B1112"
        strokeWidth={1}
      />
      {occupied ? (
        <G>
          {[0, 1, 2, 3].map((i) => {
            const z = 63.5 - i * 3.9
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
            x1={p(0.66, 55).x}
            y1={p(0.66, 55).y}
            x2={p(0.82, 55).x}
            y2={p(0.82, 55).y}
            stroke="#E9A94C"
            strokeWidth={1.1}
            opacity={0.7}
          />
          <Line
            x1={p(0, 66 - ((now / 900) % 1) * 16).x}
            y1={p(0, 66 - ((now / 900) % 1) * 16).y}
            x2={p(0.86, 66 - ((now / 900) % 1) * 16).x}
            y2={p(0.86, 66 - ((now / 900) % 1) * 16).y}
            stroke="#8FE3D0"
            strokeWidth={1}
            opacity={0.32}
          />
          <Ellipse
            cx={sx1.x + (sx2.x - sx1.x) / 2}
            cy={st1.y + 12}
            rx={20}
            ry={15}
            fill="#63B9A8"
            opacity={0.09}
          />
        </G>
      ) : (
        <G>
          <Line
            x1={p(0.22, 60).x}
            y1={p(0.22, 60).y}
            x2={p(0.66, 60).x}
            y2={p(0.66, 60).y}
            stroke="#3A4747"
            strokeWidth={1.1}
            opacity={0.6}
          />
          <Line
            x1={p(0.3, 56).x}
            y1={p(0.3, 56).y}
            x2={p(0.58, 56).x}
            y2={p(0.58, 56).y}
            stroke="#3A4747"
            strokeWidth={1.1}
            opacity={0.35}
          />
        </G>
      )}

      {/* keyboard + desk clutter; the shared monitor box includes this extent */}
      <Box
        gx={gx + 0.13}
        gy={gy + 0.48}
        w={0.64}
        d={monitorBox.d - 0.48}
        z0={34.2}
        h={1.6}
        colors={{ top: '#312C27', left: '#24201C', right: '#1C1916' }}
      />
      {[0, 1, 2].map((row) => (
        <Line
          key={row}
          x1={iso(seat.gx - 0.24, gy + 0.52, 36).x}
          y1={iso(seat.gx - 0.24, gy + 0.52 + row * 0.04, 36).y}
          x2={iso(seat.gx + 0.24, gy + 0.52 + row * 0.04, 36).x}
          y2={iso(seat.gx + 0.24, gy + 0.52 + row * 0.04, 36).y}
          stroke="#5C544A"
          strokeWidth={0.6}
          opacity={0.8}
        />
      ))}
      {index % 3 === 1 ? (
        <G>
          <Ellipse cx={iso(seat.gx + 0.38, gy + 0.3, 35).x} cy={iso(seat.gx + 0.38, gy + 0.3, 35).y} rx={4.2} ry={2.4} fill="#F1E4CE" />
          <Rect x={iso(seat.gx + 0.38, gy + 0.3, 35).x - 4.2} y={iso(seat.gx + 0.38, gy + 0.3, 35).y} width={8.4} height={5} rx={2} fill="#D9C9AF" />
        </G>
      ) : null}
      {index % 4 === 0 ? (
        <G>
          <Line
            x1={iso(seat.gx - 0.42, gy + 0.26, 34).x}
            y1={iso(seat.gx - 0.42, gy + 0.26, 34).y}
            x2={iso(seat.gx - 0.42, gy + 0.26, 58).x}
            y2={iso(seat.gx - 0.42, gy + 0.26, 58).y}
            stroke="#4A453C"
            strokeWidth={1.6}
          />
          <Polygon
            points={`${iso(seat.gx - 0.6, gy + 0.26, 59).x},${iso(seat.gx - 0.6, gy + 0.26, 59).y} ${iso(seat.gx - 0.24, gy + 0.26, 59).x},${iso(seat.gx - 0.24, gy + 0.26, 59).y} ${iso(seat.gx - 0.3, gy + 0.26, 66).x},${iso(seat.gx - 0.3, gy + 0.26, 66).y} ${iso(seat.gx - 0.54, gy + 0.26, 66).x},${iso(seat.gx - 0.54, gy + 0.26, 66).y}`}
            fill="#E9C083"
          />
          <Circle
            cx={iso(seat.gx - 0.42, gy + 0.26, 52).x}
            cy={iso(seat.gx - 0.42, gy + 0.26, 52).y}
            r={13}
            fill="#F3C57A"
            opacity={0.08}
          />
        </G>
      ) : null}
    </G>
  )
}

/** Chair fabric for a desk index; the sprite reuses it so its chair-back overlay matches. */
export function chairFabric(index: number) {
  return index % 3 === 0 ? RUST : TEAL
}

const CHAIR_BACK = { gx: -0.23, gy: 0.16, w: 0.46, d: 0.09, z0: 18, h: 17 }
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

function DeskChair({ seat, index }: { seat: Seat; index: number }) {
  const fabric = chairFabric(index)
  return (
    <G>
      <Shadow gx={seat.gx} gy={seat.gy + 0.05} rx={20} ry={8} />
      <Box gx={seat.gx - 0.3} gy={seat.gy - 0.2} w={0.08} d={0.08} z0={0} h={14} colors={METAL} />
      <Box gx={seat.gx + 0.22} gy={seat.gy - 0.2} w={0.08} d={0.08} z0={0} h={14} colors={METAL} />
      <Box gx={seat.gx - 0.3} gy={seat.gy + 0.24} w={0.08} d={0.08} z0={0} h={14} colors={METAL} />
      <Box gx={seat.gx + 0.22} gy={seat.gy + 0.24} w={0.08} d={0.08} z0={0} h={14} colors={METAL} />
      <Box gx={seat.gx + CHAIR_SEAT.gx} gy={seat.gy + CHAIR_SEAT.gy} w={CHAIR_SEAT.w} d={CHAIR_SEAT.d} z0={CHAIR_SEAT.z0} h={CHAIR_SEAT.h} colors={fabric} />
      <Box
        gx={seat.gx + CHAIR_BACK.gx}
        gy={seat.gy + CHAIR_BACK.gy}
        w={CHAIR_BACK.w}
        d={CHAIR_BACK.d}
        z0={CHAIR_BACK.z0}
        h={CHAIR_BACK.h}
        colors={{
          top: fabric.top,
          left: fabric.left,
          right: fabric.right,
        }}
        stroke="#2A2119"
        strokeOpacity={0.4}
      />
      <Rect
        x={iso(seat.gx - 0.18, seat.gy + 0.2, 32).x}
        y={iso(seat.gx - 0.18, seat.gy + 0.2, 32).y}
        width={9}
        height={1.2}
        rx={0.6}
        fill="#F4EDE0"
        opacity={0.18}
      />
    </G>
  )
}

function SofaSegment({ index }: { index: number }) {
  const { gx, gy, w, d } = SOFA
  const segD = d / SOFA_SEGMENTS
  const segGy = gy + index * segD
  const cushionGy = gy + 0.42 + index * 0.92
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
        gx={gx + 0.25}
        gy={cushionGy}
        w={0.7}
        d={0.78}
        z0={20}
        h={5}
        colors={{ top: '#6A9285', left: '#527A6E', right: '#42655B' }}
      />
      <Rect
        x={iso(gx + 0.4, gy + 0.5 + index * 0.92, 25).x}
        y={iso(gx + 0.4, gy + 0.5 + index * 0.92, 25).y}
        width={13}
        height={1.2}
        rx={0.6}
        fill="#EADCC4"
        opacity={0.22}
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
      d={0.22}
      z0={20}
      h={25}
      colors={{ top: '#5C8378', left: '#45685E', right: '#355249' }}
    />
  )
}

function ArmchairBase({ box }: { box: Box }) {
  const { gx, gy, w, d } = box
  return (
    <G>
      <Shadow gx={gx + w / 2} gy={gy + d / 2} rx={34} ry={18} />
      <Box gx={gx} gy={gy} w={w} d={d} z0={0} h={20} colors={RUST} />
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
        gy={gy}
        w={w}
        d={0.15}
        z0={20}
        h={22}
        colors={{ top: '#B26C4E', left: '#8D543D', right: '#71432F' }}
      />
      <Box
        gx={gx}
        gy={gy + d - 0.15}
        w={w}
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
  const x = iso(gx + 0.8, gy + 0.55, 22)
  return (
    <G>
      <Shadow gx={gx + 0.8} gy={gy + 0.55} rx={40} ry={18} />
      <Box gx={gx} gy={gy} w={w} d={d} z0={18} h={4.5} colors={WOOD} stroke="#C08B5D" strokeOpacity={0.4} />
      <Box gx={gx + 0.12} gy={gy + 0.12} w={0.1} d={0.1} z0={0} h={18} colors={WOOD} />
      <Box gx={gx + w - 0.22} gy={gy + 0.12} w={0.1} d={0.1} z0={0} h={18} colors={WOOD} />
      <Box gx={gx + 0.12} gy={gy + 0.83} w={0.1} d={0.1} z0={0} h={18} colors={WOOD} />
      <Box gx={gx + w - 0.22} gy={gy + 0.83} w={0.1} d={0.1} z0={0} h={18} colors={WOOD} />
      {/* books */}
      <Box gx={gx + 0.25} gy={gy + 0.25} w={0.42} d={0.28} z0={22.5} h={2.2} colors={{ top: '#B4553A', left: '#8D3E2A', right: '#713020' }} />
      <Box gx={gx + 0.3} gy={gy + 0.27} w={0.38} d={0.25} z0={24.7} h={2.1} colors={{ top: '#E9DEC9', left: '#C9BCA4', right: '#B1A48C' }} />
      {/* mug */}
      <G>
        <Ellipse cx={x.x} cy={x.y} rx={4.5} ry={2.4} fill="#F1E4CE" />
        <Rect x={x.x - 4.5} y={x.y} width={9} height={4} rx={2} fill="#D9C9AF" />
      </G>
      {/* tiny plant */}
      <Circle cx={iso(gx + 1.2, gy + 0.7, 28).x} cy={iso(gx + 1.2, gy + 0.7, 28).y} r={5} fill="#5F8A55" />
      <Circle cx={iso(gx + 1.26, gy + 0.62, 30).x} cy={iso(gx + 1.26, gy + 0.62, 30).y} r={3.4} fill="#7BA36B" />
      <Rect x={iso(gx + 1.2, gy + 0.7, 22).x - 3.4} y={iso(gx + 1.2, gy + 0.7, 22).y} width={6.8} height={6} rx={1.6} fill="#B4654A" />
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
      <Box gx={gx} gy={gy} w={0.84} d={0.58} z0={0} h={14} colors={{ top: '#7E6A57', left: '#655342', right: '#514233' }} />
      <Box gx={gx + 0.05} gy={gy + 0.05} w={0.74} d={0.48} z0={14} h={5} colors={{ top: '#D3B483', left: '#B29365', right: '#95794F' }} />
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
      <Box gx={gx} gy={gy} w={w} d={d} z0={0} h={14} colors={{ top: '#B79A6C', left: '#96794F', right: '#7C633F' }} />
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
  const p = iso(gx, gy)
  return (
    <G>
      <Shadow gx={gx} gy={gy} rx={26} ry={12} />
      <Ellipse cx={p.x} cy={p.y - 5} rx={24} ry={11} fill={color} />
      <Ellipse cx={p.x} cy={p.y - 9} rx={20} ry={9} fill={color} opacity={0.92} />
      <Ellipse cx={p.x - 3} cy={p.y - 11} rx={15} ry={6.5} fill="#FFFFFF" opacity={0.08} />
      <Ellipse cx={p.x + 6} cy={p.y - 4} rx={6} ry={3} fill="#1A120B" opacity={0.1} />
    </G>
  )
}

function Cushion({ gx, gy }: { gx: number; gy: number }) {
  return (
    <G>
      <Shadow gx={gx} gy={gy} rx={18} ry={8} />
      <Box
        gx={gx - 0.34}
        gy={gy - 0.28}
        w={0.68}
        d={0.56}
        z0={0}
        h={6}
        colors={{ top: '#C9B08B', left: '#A9916E', right: '#8C7658' }}
        stroke="#E4D4B5"
        strokeOpacity={0.6}
      />
      <Polygon
        points={isoPoints([
          [gx - 0.22, gy],
          [gx, gy + 0.12],
          [gx + 0.22, gy],
          [gx, gy - 0.12],
        ])}
        fill="#8C7658"
        opacity={0.4}
      />
    </G>
  )
}

function CoffeeCounter({ now }: { now: number }) {
  const { gx, gy, w, d } = FURNITURE_FOOTPRINTS.coffeeCounter
  const machineGlow = iso(12.55, 0.78, 58)
  return (
    <G>
      <Shadow gx={gx + 1.5} gy={gy + 0.5} rx={54} ry={16} />
      <Box gx={gx} gy={gy} w={w} d={d} z0={0} h={32} colors={{ top: '#E8DDC9', left: '#7B5636', right: '#634428' }} />
      <Box gx={gx} gy={gy} w={w} d={d} z0={32} h={4} colors={CREAM} stroke="#F4EDE0" strokeOpacity={0.5} />
      {[0, 1, 2].map((i) => (
        <Rect
          key={i}
          x={iso(gx + 0.35 + i * 0.9, gy + 0.9, 14).x}
          y={iso(gx + 0.35 + i * 0.9, gy + 0.9, 14).y}
          width={12}
          height={1.4}
          rx={0.7}
          fill="#3A291A"
          opacity={0.5}
        />
      ))}
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
          <Ellipse cx={iso(11.0 + i * 0.25, 0.86, 37).x} cy={iso(11.0 + i * 0.25, 0.86, 37).y} rx={3.4} ry={1.8} fill="#F4EDE0" />
          <Rect
            x={iso(11.0 + i * 0.25, 0.86, 37).x - 3.4}
            y={iso(11.0 + i * 0.25, 0.86, 37).y}
            width={6.8}
            height={4}
            rx={1.6}
            fill={i === 1 ? '#D97757' : '#D9C9AF'}
          />
        </G>
      ))}
      <Rect
        x={iso(10.55, 0.86, 37).x - 5}
        y={iso(10.55, 0.86, 37).y - 10}
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
  const books = ['#B4553A', '#5C8D80', '#D3A85F', '#6E5A79', '#8DA37E', '#C9B08B', '#4D6BFE']
  return (
    <G>
      <Shadow gx={gx + 0.4} gy={gy + 0.9} rx={36} ry={16} />
      <Box gx={gx} gy={gy} w={w} d={d} z0={0} h={92} colors={{ top: '#5A3D28', left: '#4A3120', right: '#3B2618' }} />
      <Box gx={gx + 0.58} gy={gy + 0.03} w={0.05} d={1.49} z0={4} h={84} colors={{ top: '#6B4A31', left: '#553824', right: '#442C1C' }} />
      {[0, 1, 2, 3].map((shelf) => {
        const z = 17 + shelf * 19
        return (
          <G key={shelf}>
            <Box
              gx={gx + 0.2}
              gy={gy + 0.05}
              w={0.4}
              d={1.45}
              z0={z}
              h={2.2}
              colors={{ top: '#6B4A31', left: '#553824', right: '#442C1C' }}
            />
            {books.slice(0, 5 + (shelf % 3)).map((color, i) => {
              const p = iso(gx + 0.61, gy + 0.12 + i * 0.13, z + 11)
              return (
                <Rect
                  key={i}
                  x={p.x}
                  y={p.y}
                  width={2.6}
                  height={10 - (i % 2)}
                  rx={0.5}
                  fill={color}
                  opacity={0.92}
                />
              )
            })}
          </G>
        )
      })}
      {/* little plant on top */}
      <Circle cx={iso(gx + 0.3, gy + 0.3, 98).x} cy={iso(gx + 0.3, gy + 0.3, 98).y} r={5} fill="#5F8A55" />
    </G>
  )
}

function FloorLamp({ now }: { now: number }) {
  const { gx, gy, w, d } = FURNITURE_FOOTPRINTS.floorLamp
  const base = iso(gx + w / 2, gy + d / 2)
  const shadeY = base.y - 92
  return (
    <G>
      <Ellipse cx={base.x} cy={base.y + 1} rx={13} ry={6} fill="#0C0805" opacity={0.22} />
      <Ellipse cx={base.x} cy={base.y} rx={10} ry={4.5} fill="#3C342C" />
      <Line x1={base.x} y1={base.y - 2} x2={base.x} y2={shadeY} stroke="#6B5B48" strokeWidth={2} />
      <Polygon
        points={`${base.x - 15},${shadeY + 12} ${base.x + 15},${shadeY + 12} ${base.x + 9},${shadeY - 8} ${base.x - 9},${shadeY - 8}`}
        fill="#E9C083"
      />
      <Polygon
        points={`${base.x - 15},${shadeY + 12} ${base.x + 15},${shadeY + 12} ${base.x + 9},${shadeY - 8} ${base.x - 9},${shadeY - 8}`}
        fill="#F3C57A"
        opacity={0.35 + 0.08 * Math.sin(now / 900)}
      />
      <Ellipse cx={base.x} cy={shadeY + 15} rx={34} ry={20} fill="#F3C57A" opacity={0.13} />
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
        <G key={i} transform={`rotate(${leaf.angle * 0.25} ${leaf.topX} ${leaf.topY})`}>
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
      <Box gx={gx} gy={gy} w={w} d={d} z0={17} h={3.5} colors={WOOD} />
      <Box gx={gx + 0.08} gy={gy + 0.08} w={0.07} d={0.07} z0={0} h={17} colors={METAL} />
      <Box gx={gx + w - 0.15} gy={gy + 0.08} w={0.07} d={0.07} z0={0} h={17} colors={METAL} />
      <Box gx={gx + 0.08} gy={gy + d - 0.15} w={0.07} d={0.07} z0={0} h={17} colors={METAL} />
      <Box gx={gx + w - 0.15} gy={gy + d - 0.15} w={0.07} d={0.07} z0={0} h={17} colors={METAL} />
      <Ellipse cx={iso(gx + 0.31, gy + 0.31, 24).x} cy={iso(gx + 0.31, gy + 0.31, 24).y} rx={6} ry={2.6} fill="#D9C9AF" />
      <Rect x={iso(gx + 0.31, gy + 0.31, 24).x - 6} y={iso(gx + 0.31, gy + 0.31, 24).y} width={12} height={3.5} rx={1.6} fill="#C9B08B" />
      <SvgText
        x={iso(gx + 0.31, gy + 0.31, 30).x}
        y={iso(gx + 0.31, gy + 0.31, 30).y}
        textAnchor="middle"
        fontSize={6}
        fontFamily="DMSans_500Medium"
        fill="#5A4630"
      >
        tea
      </SvgText>
    </G>
  )
}
