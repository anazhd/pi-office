import {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg'
import { floorPolygon, iso, isoPoints, WALL_H } from './iso'
import { LEFT_WINDOWS, RIGHT_WINDOWS, OPS_BOARD, SKY_ORB_WINDOW, rightWallTransform, type WindowSpec } from './wall-art'

const WOOD_TILES = ['#7A5D48', '#84664D', '#735745', '#7D6048']
const SKEW = 26.565

function skyPalette(now: number) {
  const date = new Date(now)
  const hour = date.getHours() + date.getMinutes() / 60
  if (hour >= 5.5 && hour < 8.5) {
    return { top: '#3F4C63', mid: '#B98A78', bottom: '#F0C39A', orb: '#F3C57A', night: false }
  }
  if (hour >= 8.5 && hour < 17) {
    return { top: '#8FC3D6', mid: '#B9DCE2', bottom: '#EAF1DF', orb: '#F7E3A8', night: false }
  }
  if (hour >= 17 && hour < 20.5) {
    return { top: '#6A5B72', mid: '#C97C63', bottom: '#F2B476', orb: '#F6D08A', night: false }
  }
  return { top: '#101A31', mid: '#1B2743', bottom: '#2B3A56', orb: '#EFE6CF', night: true }
}

export function Backdrop({ activeSessions, now }: { activeSessions: number; now: number }) {
  const sky = skyPalette(now)
  const date = new Date(now)
  const clockMinutes = date.getMinutes()
  const clockHours = date.getHours() % 12
  const hourAngle = (clockHours / 12) * Math.PI * 2 + (clockMinutes / 60) * (Math.PI / 6)
  const minuteAngle = (clockMinutes / 60) * Math.PI * 2

  return (
    <G>
      <Defs>
        <LinearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sky.top} />
          <Stop offset="0.58" stopColor={sky.mid} />
          <Stop offset="1" stopColor={sky.bottom} />
        </LinearGradient>
        <LinearGradient id="wallRight" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7C6049" />
          <Stop offset="1" stopColor="#5C4534" />
        </LinearGradient>
        <LinearGradient id="wallLeft" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6A503D" />
          <Stop offset="1" stopColor="#4C392B" />
        </LinearGradient>
        {RIGHT_WINDOWS.map((w, i) => (
          <ClipPath id={`winR${i}`} key={`r${i}`}>
            <Polygon
              points={isoPoints([
                [w.start, 0, 58],
                [w.start + w.length, 0, 58],
                [w.start + w.length, 0, 160],
                [w.start, 0, 160],
              ])}
            />
          </ClipPath>
        ))}
        {LEFT_WINDOWS.map((w, i) => (
          <ClipPath id={`winL${i}`} key={`l${i}`}>
            <Polygon
              points={isoPoints([
                [0, w.start, 58],
                [0, w.start + w.length, 58],
                [0, w.start + w.length, 160],
                [0, w.start, 160],
              ])}
            />
          </ClipPath>
        ))}
      </Defs>

      {/* shadow under the whole office */}
      <Polygon
        points={floorPolygon(-0.45, -0.3, 14.9, 10.9)}
        fill="#080604"
        opacity={0.7}
        transform="translate(0 11)"
      />

      {/* floor */}
      <Polygon
        points={isoPoints([
          [0, 0],
          [14, 0],
          [14, 10],
          [0, 10],
        ])}
        fill="#584331"
      />
      {Array.from({ length: 10 }).map((_, gy) =>
        Array.from({ length: 14 }).map((__, gx) => (
          <Polygon
            key={`${gx}-${gy}`}
            points={floorPolygon(gx, gy, 1, 1)}
            fill={WOOD_TILES[(gx * 3 + gy * 5) % WOOD_TILES.length]}
            stroke="#2B221B"
            strokeWidth={0.6}
            strokeOpacity={0.55}
          />
        )),
      )}

      {/* soft light pool from the windows */}
      <Polygon
        points={isoPoints([
          [1.2, 1.0],
          [4.2, 1.0],
          [6.4, 4.6],
          [3.4, 4.6],
        ])}
        fill={sky.night ? '#8FB9C9' : '#F6E7C8'}
        opacity={sky.night ? 0.04 : 0.07}
      />

      <Ellipse cx={340} cy={392} rx={400} ry={190} fill="#F3C57A" opacity={0.055} />
      <Ellipse cx={560} cy={470} rx={250} ry={130} fill="#F3C57A" opacity={0.045} />
      <Ellipse cx={210} cy={335} rx={210} ry={105} fill="#F6E7C8" opacity={0.05} />

      <Rug />
      <EntranceMat />

      {/* back-right wall */}
      <Polygon
        points={isoPoints([
          [0, 0, 0],
          [14, 0, 0],
          [14, 0, WALL_H],
          [0, 0, WALL_H],
        ])}
        fill="url(#wallRight)"
      />
      {/* back-left wall */}
      <Polygon
        points={isoPoints([
          [0, 0, 0],
          [0, 10, 0],
          [0, 10, WALL_H],
          [0, 0, WALL_H],
        ])}
        fill="url(#wallLeft)"
      />

      {/* wainscot + top trim */}
      <Polygon
        points={isoPoints([
          [0, 0, 0],
          [14, 0, 0],
          [14, 0, 30],
          [0, 0, 30],
        ])}
        fill="#453327"
        opacity={0.7}
      />
      <Polygon
        points={isoPoints([
          [0, 0, 0],
          [0, 10, 0],
          [0, 10, 30],
          [0, 0, 30],
        ])}
        fill="#3D2C21"
        opacity={0.7}
      />
      <Polygon
        points={isoPoints([
          [0, 0, WALL_H],
          [14, 0, WALL_H],
          [14, 0, WALL_H - 5],
          [0, 0, WALL_H - 5],
        ])}
        fill="#3A2A1F"
        opacity={0.75}
      />
      <Polygon
        points={isoPoints([
          [0, 0, WALL_H],
          [0, 10, WALL_H],
          [0, 10, WALL_H - 5],
          [0, 0, WALL_H - 5],
        ])}
        fill="#33251B"
        opacity={0.75}
      />

      {RIGHT_WINDOWS.map((w, i) => (
        <RightWindow key={`rw${i}`} spec={w} index={i} sky={sky} />
      ))}
      {LEFT_WINDOWS.map((w, i) => (
        <LeftWindow key={`lw${i}`} spec={w} index={i} sky={sky} />
      ))}

      <OpsBoard active={activeSessions} />
      <WallClock hourAngle={hourAngle} minuteAngle={minuteAngle} />
    </G>
  )
}

function RightWindow({
  spec,
  index,
  sky,
}: {
  spec: WindowSpec
  index: number
  sky: ReturnType<typeof skyPalette>
}) {
  const { start, length } = spec
  const p1 = iso(start, 0, 58)
  const p2 = iso(start + length, 0, 58)
  const t1 = iso(start, 0, 160)
  const t2 = iso(start + length, 0, 160)
  const mx = (p1.x + p2.x) / 2
  const my = (p1.y + p2.y) / 2
  const mtx = (t1.x + t2.x) / 2
  const mty = (t1.y + t2.y) / 2
  const midZ = iso(start, 0, 109)
  const midZ2 = iso(start + length, 0, 109)
  const orb = iso(start + length * 0.7, 0, 132)

  return (
    <G>
      <Polygon
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${t2.x},${t2.y} ${t1.x},${t1.y}`}
        fill="url(#skyGrad)"
      />
      <G clipPath={`url(#winR${index})`}>
        <Skyline x1={p1.x} x2={p2.x} y1={p1.y} y2={p2.y} night={sky.night} />
        {index === SKY_ORB_WINDOW.index ? <G>
        <Circle cx={orb.x} cy={orb.y} r={sky.night ? 8 : 10} fill={sky.orb} opacity={sky.night ? 0.85 : 0.7} />
        {!sky.night ? (
          <Circle cx={orb.x} cy={orb.y} r={19} fill={sky.orb} opacity={0.13} />
        ) : (
          <Circle cx={orb.x - 3} cy={orb.y - 2} r={7} fill={sky.top} opacity={0.35} />
        )}
        </G> : null}
        {sky.night
          ? [0, 1, 2, 3, 4].map((i) => (
              <Circle
                key={i}
                cx={p1.x + ((p2.x - p1.x) * (i + 1)) / 7}
                cy={t1.y + ((t2.y - t1.y) * (i + 1)) / 7 + 18 + (i % 2) * 12}
                r={1.1}
                fill="#F4EDE0"
                opacity={0.55}
              />
            ))
          : null}
      </G>
      <Polygon
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${t2.x},${t2.y} ${t1.x},${t1.y}`}
        fill="none"
        stroke="#2A2119"
        strokeWidth={3.2}
      />
      <Line x1={mx} y1={my} x2={mtx} y2={mty} stroke="#2A2119" strokeWidth={2.4} />
      <Line
        x1={midZ.x}
        y1={midZ.y}
        x2={midZ2.x}
        y2={midZ2.y}
        stroke="#2A2119"
        strokeWidth={2.2}
      />
      <Polygon
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p2.x},${p2.y + 5} ${p1.x},${p1.y + 5}`}
        fill="#8A7258"
      />
      <Polygon
        points={`${p1.x + 4},${p1.y - 9} ${p1.x + 12},${p1.y - 4} ${p1.x + 12},${t1.y + 8} ${p1.x + 4},${t1.y + 3}`}
        fill="#FFFFFF"
        opacity={sky.night ? 0.025 : 0.09}
      />
    </G>
  )
}

function LeftWindow({
  spec,
  index,
  sky,
}: {
  spec: WindowSpec
  index: number
  sky: ReturnType<typeof skyPalette>
}) {
  const { start, length } = spec
  const p1 = iso(0, start, 58)
  const p2 = iso(0, start + length, 58)
  const t1 = iso(0, start, 160)
  const t2 = iso(0, start + length, 160)
  const mx = (p1.x + p2.x) / 2
  const my = (p1.y + p2.y) / 2
  const mtx = (t1.x + t2.x) / 2
  const mty = (t1.y + t2.y) / 2
  const midZ = iso(0, start, 109)
  const midZ2 = iso(0, start + length, 109)

  return (
    <G>
      <Polygon
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${t2.x},${t2.y} ${t1.x},${t1.y}`}
        fill="url(#skyGrad)"
      />
      <G clipPath={`url(#winL${index})`}>
        <Skyline x1={p1.x} x2={p2.x} y1={p1.y} y2={p2.y} night={sky.night} />
      </G>
      <Polygon
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${t2.x},${t2.y} ${t1.x},${t1.y}`}
        fill="none"
        stroke="#241C16"
        strokeWidth={3.2}
      />
      <Line x1={mx} y1={my} x2={mtx} y2={mty} stroke="#241C16" strokeWidth={2.4} />
      <Line
        x1={midZ.x}
        y1={midZ.y}
        x2={midZ2.x}
        y2={midZ2.y}
        stroke="#241C16"
        strokeWidth={2.2}
      />
      <Polygon
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p2.x},${p2.y + 5} ${p1.x},${p1.y + 5}`}
        fill="#7A6550"
      />
    </G>
  )
}

function Skyline({
  x1,
  x2,
  y1,
  y2,
  night,
}: {
  x1: number
  x2: number
  y1: number
  y2: number
  night: boolean
}) {
  const count = 7
  return (
    <G opacity={night ? 0.9 : 0.5}>
      {Array.from({ length: count }).map((_, i) => {
        const f1 = i / count
        const f2 = (i + 0.82) / count
        const bx1 = x1 + (x2 - x1) * f1
        const bx2 = x1 + (x2 - x1) * f2
        const by1 = y1 + (y2 - y1) * f1
        const by2 = y1 + (y2 - y1) * f2
        const h = 16 + ((i * 13) % 34)
        return (
          <G key={i}>
            <Polygon
              points={`${bx1},${by1} ${bx2},${by2} ${bx2},${by2 - h} ${bx1},${by1 - h}`}
              fill={night ? '#0E1727' : '#3C4A50'}
              opacity={0.7}
            />
            {!night
              ? [0, 1].map((j) => (
                  <Rect
                    key={j}
                    x={bx1 + 2 + j * 6}
                    y={by1 - h + 5 + j * 7}
                    width={2.6}
                    height={2.4}
                    fill="#F6D79A"
                    opacity={0.55}
                  />
                ))
              : null}
          </G>
        )
      })}
    </G>
  )
}

function OpsBoard({ active }: { active: number }) {
  const { gx, z, width, height } = OPS_BOARD
  return (
    <G transform={rightWallTransform(gx, z)}>
      <Rect x={-width / 2} y={-height / 2} width={width} height={height}
        fill="#241E18" stroke="#8A7358" strokeWidth={2.2} />
      <G>
        <SvgText
          x={0}
          y={-23}
          textAnchor="middle"
          fontSize={7}
          letterSpacing={2}
          fontFamily="DMSans_500Medium"
          fill="#8C7A63"
        >
          OPS
        </SvgText>
        <SvgText
          x={0}
          y={5}
          textAnchor="middle"
          fontSize={26}
          fontFamily="Fraunces_600SemiBold"
          fill="#F3C57A"
        >
          {active}
        </SvgText>
        <SvgText
          x={0}
          y={19}
          textAnchor="middle"
          fontSize={6.6}
          fontFamily="DMSans_500Medium"
          fill="#A8957A"
        >
          {active === 1 ? 'active session' : 'active sessions'}
        </SvgText>
        {[0, 1, 2, 3].map((i) => (
          <Rect
            key={i}
            x={-26 + i * 14}
            y={28}
            width={9}
            height={3}
            rx={1.5}
            fill={i < Math.min(4, active) ? '#63B9A8' : '#443A2E'}
          />
        ))}
      </G>
    </G>
  )
}

function WallClock({ hourAngle, minuteAngle }: { hourAngle: number; minuteAngle: number }) {
  const hx = Math.sin(hourAngle) * 7
  const hy = -Math.cos(hourAngle) * 7
  const mx = Math.sin(minuteAngle) * 10
  const my = -Math.cos(minuteAngle) * 10
  return (
    <G transform={rightWallTransform(7.5, 118)}>
      <Circle cx={0} cy={0} r={17} fill="#2D241C" stroke="#8A7358" strokeWidth={2} />
      <Circle cx={0} cy={0} r={13.5} fill="#EFE6D5" opacity={0.92} />
      <Line x1={0} y1={0} x2={hx} y2={hy} stroke="#33281F" strokeWidth={2.2} strokeLinecap="round" />
      <Line x1={0} y1={0} x2={mx} y2={my} stroke="#33281F" strokeWidth={1.2} strokeLinecap="round" />
      <Circle cx={0} cy={0} r={1.4} fill="#B4553A" />
    </G>
  )
}

function Rug() {
  const outer = isoPoints([
    [8.15, 4.62],
    [13.6, 4.62],
    [13.6, 8.98],
    [8.15, 8.98],
  ])
  const inner = isoPoints([
    [8.35, 4.8],
    [13.4, 4.8],
    [13.4, 8.8],
    [8.35, 8.8],
  ])
  return (
    <G>
      <Polygon points={outer} fill="#4F4245" />
      <Polygon points={inner} fill="#5C4B4E" stroke="#D6BD93" strokeWidth={1.1} strokeOpacity={0.55} />
      {[
        [9.1, 5.45],
        [11.0, 5.45],
        [12.85, 5.45],
        [9.1, 7.95],
        [12.85, 7.95],
      ].map(([gx, gy], i) => (
        <Polygon
          key={i}
          points={isoPoints([
            [gx, gy],
            [gx + 0.34, gy + 0.22],
            [gx, gy + 0.44],
            [gx - 0.34, gy + 0.22],
          ])}
          fill="none"
          stroke="#D6BD93"
          strokeWidth={0.8}
          strokeOpacity={0.3}
        />
      ))}
    </G>
  )
}

function EntranceMat() {
  const center = iso(6.9, 9.26)
  return (
    <G>
      <Polygon
        points={isoPoints([
          [6.12, 8.9],
          [7.68, 8.9],
          [7.68, 9.62],
          [6.12, 9.62],
        ])}
        fill="#3F3127"
        stroke="#A98A62"
        strokeWidth={1.2}
        strokeOpacity={0.65}
      />
      <G transform={`translate(${center.x} ${center.y}) skewY(${SKEW})`}>
        <SvgText
          x={0}
          y={5}
          textAnchor="middle"
          fontSize={13}
          fontFamily="Fraunces_600SemiBold"
          fill="#E9A94C"
          opacity={0.6}
        >
          π
        </SvgText>
      </G>
    </G>
  )
}
