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
import { SEASON_LOOKS, type Season } from './season'
import { skyPalette, type SkyPalette } from './sky'
import {
  LEFT_WINDOWS,
  RIGHT_WINDOWS,
  OPS_BOARD,
  SKY_ORB,
  SKY_ORB_NIGHT_RADIUS,
  SKY_ORB_WINDOW,
  rightWallTransform,
  windowGlass,
  type WindowSpec,
} from './wall-art'

const WOOD_TILES = ['#7A5D48', '#84664D', '#735745', '#7D6048']
const SKEW = 26.565

export function Backdrop({
  activeSessions,
  now,
  season,
}: {
  activeSessions: number
  now: number
  season: Season
}) {
  const look = SEASON_LOOKS[season]
  const sky = skyPalette(now, season)
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
            <Polygon points={windowGlass('right', w, i).points} />
          </ClipPath>
        ))}
        {LEFT_WINDOWS.map((w, i) => (
          <ClipPath id={`winL${i}`} key={`l${i}`}>
            <Polygon points={windowGlass('left', w, i).points} />
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

      {/* seasonal tint, kept whisper-quiet so sprites keep their true colours */}
      <Polygon
        points={isoPoints([
          [0, 0],
          [14, 0],
          [14, 10],
          [0, 10],
        ])}
        fill={look.floorTint.color}
        opacity={look.floorTint.opacity}
      />

      {/* soft light pool from the windows */}
      <Polygon
        points={isoPoints([
          [1.2, 1.0],
          [4.2, 1.0],
          [6.4, 4.6],
          [3.4, 4.6],
        ])}
        fill={sky.night ? '#8FB9C9' : look.pool.color}
        opacity={sky.night ? 0.04 : look.pool.opacity}
      />

      <Ellipse cx={340} cy={392} rx={400} ry={190} fill="#F3C57A" opacity={0.055 * look.warmth} />
      <Ellipse cx={560} cy={470} rx={250} ry={130} fill="#F3C57A" opacity={0.045 * look.warmth} />
      <Ellipse cx={210} cy={335} rx={210} ry={105} fill="#F6E7C8" opacity={0.05 * look.warmth} />

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
        <RightWindow key={`rw${i}`} spec={w} index={i} sky={sky} season={season} />
      ))}
      {LEFT_WINDOWS.map((w, i) => (
        <LeftWindow key={`lw${i}`} spec={w} index={i} sky={sky} season={season} />
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
  season,
}: {
  spec: WindowSpec
  index: number
  sky: SkyPalette
  season: Season
}) {
  const { start, length } = spec
  const glass = windowGlass('right', spec, index)
  const p1 = glass.bottomLeft
  const p2 = glass.bottomRight
  const t1 = glass.topLeft
  const t2 = glass.topRight
  const orb = iso(start + length * SKY_ORB.along, 0, SKY_ORB.z)

  return (
    <G>
      <Polygon points={glass.points} fill="url(#skyGrad)" />
      <G clipPath={`url(#winR${index})`}>
        <Skyline
          x1={p1.x}
          x2={p2.x}
          y1={p1.y}
          y2={p2.y}
          night={sky.night}
          season={season}
          length={length}
        />
        {index === SKY_ORB_WINDOW.index ? <G>
        <Circle cx={orb.x} cy={orb.y} r={sky.night ? SKY_ORB_NIGHT_RADIUS : 10} fill={sky.orb} opacity={sky.night ? 0.85 : 0.7} />
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
    </G>
  )
}

function LeftWindow({
  spec,
  index,
  sky,
  season,
}: {
  spec: WindowSpec
  index: number
  sky: SkyPalette
  season: Season
}) {
  const { length } = spec
  const glass = windowGlass('left', spec, index)
  const p1 = glass.bottomLeft
  const p2 = glass.bottomRight

  return (
    <G>
      <Polygon points={glass.points} fill="url(#skyGrad)" />
      <G clipPath={`url(#winL${index})`}>
        <Skyline
          x1={p1.x}
          x2={p2.x}
          y1={p1.y}
          y2={p2.y}
          night={sky.night}
          season={season}
          length={length}
        />
      </G>
    </G>
  )
}

function Skyline({
  x1,
  x2,
  y1,
  y2,
  night,
  season,
  length,
}: {
  x1: number
  x2: number
  y1: number
  y2: number
  night: boolean
  season: Season
  length: number
}) {
  const count = 7
  const roofSnow = SEASON_LOOKS[season].roofSnow
  return (
    <G>
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
            {roofSnow ? (
              <Polygon
                points={`${bx1},${by1 - h} ${bx2},${by2 - h} ${bx2},${by2 - h + 2.2} ${bx1},${by1 - h + 2.2}`}
                fill="#EEF3F7"
                opacity={night ? 0.5 : 0.85}
              />
            ) : null}
          </G>
        )
      })}
      </G>
      <TreeLine
        x1={x1}
        x2={x2}
        y1={y1}
        y2={y2}
        night={night}
        season={season}
        length={length}
      />
    </G>
  )
}

const TREE_COLORS: Record<string, string[]> = {
  blossom: ['#86B86A', '#7CAD62', '#93C077'],
  full: ['#4F8A4A', '#3F7440', '#5C9653'],
  turning: ['#C97A36', '#B5532F', '#D9A441'],
}

function TreeLine({
  x1,
  x2,
  y1,
  y2,
  night,
  season,
  length,
}: {
  x1: number
  x2: number
  y1: number
  y2: number
  night: boolean
  season: Season
  length: number
}) {
  const trees = SEASON_LOOKS[season].trees
  const count = Math.max(2, Math.round(length * 2.2))
  const colors = TREE_COLORS[trees]
  return (
    <G opacity={night ? 0.5 : 1}>
      {Array.from({ length: count }).map((_, i) => {
        const f = (i + 0.5) / count
        const x = x1 + (x2 - x1) * f
        const sill = y1 + (y2 - y1) * f
        const r = 5 + ((i * 7) % 4) * 1.1
        const cy = sill - 3
        const trunk = trees === 'bare' ? (night ? '#6E6052' : '#4A3F38') : '#5C4A38'
        return (
          <G key={i}>
            <Line x1={x} y1={cy} x2={x} y2={sill + 6} stroke={trunk} strokeWidth={1.3} />
            {trees === 'bare' ? (
              <G>
                <Line x1={x} y1={cy + 2} x2={x - r * 0.9} y2={cy - 5} stroke={trunk} strokeWidth={0.9} />
                <Line x1={x} y1={cy + 1} x2={x + r * 0.9} y2={cy - 6} stroke={trunk} strokeWidth={0.9} />
                <Line x1={x} y1={cy - 1} x2={x} y2={cy - 8} stroke={trunk} strokeWidth={0.8} />
                {/* a thin line of snow on the upper side of each branch */}
                <Line x1={x - r * 0.9} y1={cy - 5.6} x2={x} y2={cy - 2.6} stroke="#EAF2F7" strokeWidth={1.1} opacity={0.55} strokeLinecap="round" />
                <Line x1={x} y1={cy - 2.6} x2={x + r * 0.9} y2={cy - 6.6} stroke="#EAF2F7" strokeWidth={1.1} opacity={0.55} strokeLinecap="round" />
              </G>
            ) : (
              <G>
                <Circle cx={x} cy={cy} r={r} fill={colors[i % colors.length]} opacity={0.95} />
                <Circle cx={x + r * 0.35} cy={cy - r * 0.45} r={r * 0.62} fill={colors[(i + 1) % colors.length]} opacity={0.9} />
                {trees === 'blossom' ? (
                  <G>
                    <Circle cx={x - r * 0.4} cy={cy - r * 0.2} r={1.5} fill="#F2C6D2" />
                    <Circle cx={x + r * 0.5} cy={cy + r * 0.3} r={1.2} fill="#F2C6D2" />
                  </G>
                ) : null}
              </G>
            )}
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
