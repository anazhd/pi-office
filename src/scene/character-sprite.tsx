import { seatedPose } from './seated-pose'
import { Circle, Ellipse, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg'
import { type Seat } from './layout'
import { nameTagTop, NAME_TAG_HEIGHT, NAME_TAG_OPACITY } from './name-tag'
import type { Heading, SceneCharacter } from './use-scene-model'
import { hashIndex, iso } from './iso'
import { lookFor, shade, type Look } from './palette'
import { CHAIR_BACK_LOCAL, CHAIR_SEAT_LOCAL, chairFabric } from './furniture'

type Props = {
  scene: SceneCharacter
  now: number
  selected: boolean
  dense: boolean
  onSelect: (id: string) => void
}

const CONFETTI = ['#E9A94C', '#63B9A8', '#D97757', '#F4EDE0', '#8DA37E']

export function CharacterSprite({ scene, now, selected, dense, onSelect }: Props) {
  const { char, pose, gx, gy } = scene
  const look = lookFor(char)
  const { x, y } = iso(gx, gy)
  const phase = now / 1000
  const offset = hashIndex(char.id, 11, 1000) / 90

  const walking = pose === 'walking'
  const waiting = pose === 'waiting'
  const typing = pose === 'typing'
  const relaxing = pose === 'relaxing'
  const bob = walking || waiting ? 0 : Math.sin(phase * 1.5 + offset) * 1
  // Step cadence follows the distance actually covered along the path, so the feet
  // plant at walking speed instead of skating under a fixed clock.
  const cycle = scene.strideTiles / 0.75
  // Progress has no duration attached: infer it from distance after the first few
  // samples, falling back to a typical trip. Clamp to keep short hops gentle.
  const duration = scene.walkProgress > 0.01
    ? Math.max(1500, Math.min(12000, scene.strideTiles / scene.walkProgress * 600))
    : 3000
  const edge = Math.min(scene.walkProgress, 1 - scene.walkProgress) * duration / 200
  const blend = walking ? Math.max(0, Math.min(1, edge)) : 0
  const settle = 1 - blend
  const typeBeat = Math.sin(phase * 7.5 + offset) * 1.2
  const chair = chairFabric(scene.deskIndex ?? 0)

  const sipPeriod = 7 + (hashIndex(char.id, 12, 55) / 10)
  const sipPhase = ((phase + offset) % sipPeriod)
  const sip = !walking && !typing && !relaxing && sipPhase < 1.3 ? Math.sin((sipPhase / 1.3) * Math.PI) : 0

  const steamT = (phase * 0.45 + offset * 0.1) % 1

  const label = `${char.displayName}, ${char.title}, level ${char.level}. Open details.`

  return (
    <G onPress={() => onSelect(char.id)} accessibilityLabel={label}>
      {selected ? (
        <>
          <Ellipse cx={x} cy={y + 2} rx={25} ry={10} fill="#E9A94C" opacity={0.1} />
          <Ellipse
            cx={x}
            cy={y + 2}
            rx={21}
            ry={8}
            fill="none"
            stroke="#E9A94C"
            strokeWidth={1.4}
            opacity={0.85}
          />
        </>
      ) : null}

      <Ellipse cx={x} cy={y + 2} rx={17} ry={6.5} fill="#1A120B" opacity={0.3} />

      <G transform={`translate(${x} ${y})`}>
        {walking || waiting ? (
          <WalkingBody
            look={look}
            cycle={cycle}
            blend={blend}
            settle={walking ? settle : 0}
            heading={scene.heading}
            phase={phase}
            still={waiting}
          />
        ) : (
          <SeatedBody
            seat={scene.seat}
            look={look}
            typing={typing}
            relaxing={relaxing}
            chair={chair}
            bob={bob}
            typeBeat={typeBeat}
            sip={sip}
            steamT={steamT}
            phase={phase}
            offset={offset}
          />
        )}

      </G>

      {scene.confetti ? (
        <Confetti x={x} y={y} now={now} enteredAt={scene.enteredAt} seed={char.id} />
      ) : null}

      {typing || relaxing ? (
        <Ellipse cx={x + 12} cy={y - 50} rx={25} ry={20} fill="#8FE3D0" opacity={0.055} />
      ) : null}
    </G>
  )
}


/** Name tags are rendered in a layer above everyone so they are never covered. */
export function CharacterTag({
  scene,
  selected,
  dense,
  onSelect,
}: Props) {
  const { char, gx, gy } = scene
  const look = lookFor(char)
  const { x, y } = iso(gx, gy)
  return (
    <G onPress={() => onSelect(char.id)} transform={`translate(${x} ${y})`}>
      <G transform={`translate(0 ${nameTagTop(scene)})`}>
        <NameTag look={look} char={char} selected={selected} dense={dense} />
      </G>
    </G>
  )
}

function NameTag({
  look,
  char,
  selected,
  dense,
}: {
  look: Look
  char: SceneCharacter['char']
  selected: boolean
  dense: boolean
}) {
  const full = selected || char.status !== 'idle' || !dense
  const name = full ? char.displayName : char.displayName.split(' ')[0]
  const width = Math.max(30, name.length * 3.7 + 11)
  return (
    <G>
      <Rect
        x={-width / 2}
        y={0}
        width={width}
        height={NAME_TAG_HEIGHT}
        rx={5.4}
        fill="#15110D"
        opacity={selected ? NAME_TAG_OPACITY.selected : NAME_TAG_OPACITY.normal}
        stroke={selected ? '#E9A94C' : look.shirt}
        strokeOpacity={selected ? 0.9 : 0.38}
        strokeWidth={0.8}
      />
      <SvgText
        x={-3.5}
        y={7.2}
        textAnchor="middle"
        fontSize={6.2}
        fontFamily="DMSans_500Medium"
        fill="#F4EDE0"
      >
        {name}
      </SvgText>
      <Circle cx={width / 2 + 4.6} cy={4.8} r={4.4} fill="#E9A94C" />
      <SvgText
        x={width / 2 + 4.6}
        y={6.9}
        textAnchor="middle"
        fontSize={5.4}
        fontFamily="DMSans_700Bold"
        fill="#1B140B"
      >
        {char.level}
      </SvgText>
    </G>
  )
}

// All limb silhouettes are static. Only their short translations change per tick.
const WALK_TORSO = 'M -10 -33 Q -11 -41 -3 -41 L 4 -40 Q 10 -39 10 -33 L 9 -17 Q 0 -14 -9 -17 Z'
const WALK_ARM = 'M 0 0 Q -1 5 1 10 L 2 13'

/** Stance is linear backwards (a planted shoe); swing returns smoothly with toe clearance. */
function footfall(cycle: number) {
  const t = ((cycle % 1) + 1) % 1
  if (t < 0.5) return { travel: 6 - 24 * t, lift: 0 }
  const u = (t - 0.5) * 2
  return { travel: -6 + 12 * u * u * (3 - 2 * u), lift: 2.6 * Math.sin(u * Math.PI) }
}

function WalkingBody({
  look, cycle, blend, settle, heading, phase, still = false,
}: {
  look: Look
  cycle: number
  blend: number
  settle: number
  heading: Heading
  phase: number
  still?: boolean
}) {
  const back = heading === 'back-left' || heading === 'back-right'
  const mirror = heading === 'front-left' || heading === 'back-left'
  const amount = still ? 0 : blend
  const far = footfall(cycle)
  const near = footfall(cycle + 0.5)
  const directionY = back ? -0.5 : 0.5
  const nearX = back ? 5 : -5
  const angle = cycle * Math.PI * 2
  const bob = (1 - Math.cos(angle * 2)) * 0.6 * amount
  const sway = Math.sin(angle) * 0.35 * amount
  const drop = settle * 3
  const arm = (foot: ReturnType<typeof footfall>, x: number, isNear: boolean) => (
    <G transform={`translate(${x} ${isNear ? -36 : -38}) rotate(${foot.travel * amount * 1.4} 0 0)`}>
      <Path d={WALK_ARM} stroke={back ? look.shirtBack : look.shirtDark} strokeWidth={5} strokeLinecap="round" fill="none" />
      <Circle cx={2} cy={13} r={2.7} fill={look.skin} />
    </G>
  )
  const leg = (foot: ReturnType<typeof footfall>, x: number, isNear: boolean) => {
    const dx = foot.travel * amount
    // Two narrow tracks, not a single tightrope: shoes never scissor through
    // one another at contact, even when projected onto the screen's x axis.
    const footX = x * 1.4 + dx
    const dy = dx * directionY - foot.lift * amount
    const ground = isNear ? 0 : -3
    return (
      <G>
        <Line x1={x} y1={-18 + drop} x2={footX} y2={ground - 2 + dy} stroke={look.pants} strokeWidth={6} strokeLinecap="round" />
        <G transform={`translate(${footX} ${ground + dy})`}>
          <Path d="M -4 -3 Q -4 -5 0 -5 L 5 -3 Q 7 -1 5 1 L -3 1 Q -5 0 -4 -3 Z" fill="#2E2924" />
          <Path d="M -3 0 L 5 0" stroke="#928778" strokeWidth={0.8} strokeLinecap="round" />
        </G>
      </G>
    )
  }
  return (
    <G transform={mirror ? 'scale(-1 1)' : undefined}>
      {leg(far, -nearX, false)}
      {leg(near, nearX, true)}
      <G transform={`translate(${sway + amount * 0.8} ${drop - bob}) rotate(${amount * 1.4} 0 -17)`}>
        {arm(far, -nearX * 2, false)}
        <Path d={WALK_TORSO} fill={back ? look.shirtBack : look.shirt} />
        {back ? (
          <Path d="M -6 -36 Q 0 -33 6 -36" stroke={look.shirtDark} strokeWidth={1} opacity={0.4} fill="none" />
        ) : (
          <G transform="translate(2 0)">
            <Path d="M -8 -39 L 0 -34 L 7 -38" stroke={look.shirtDark} strokeWidth={1.5} fill="none" />
            <Rect x={-4} y={-35} width={8} height={6} rx={1.5} fill="#F4EDE0" />
            <Line x1={-2} y1={-32} x2={2} y2={-32} stroke={look.shirtDark} strokeWidth={1} />
          </G>
        )}
        {arm(near, nearX * 2, true)}
        {/* Head trails the shoulder bob slightly; the entire hairstyle mirrors with facing. */}
        <G transform={`translate(${back ? 0.4 : 2} ${(Math.cos(angle * 2 - 0.45) - Math.cos(angle * 2)) * 0.3 * amount})`}>
          {back ? <BackHead look={look} cy={-48} phase={phase} /> : <Head look={look} typing={false} sip={0} phase={phase} faceTurn={2} />}
        </G>
      </G>
    </G>
  )
}

function SeatedBody({
  seat,
  look,
  typing,
  relaxing,
  chair,
  bob,
  typeBeat,
  sip,
  steamT,
  phase,
  offset,
}: {
  seat: Seat
  look: Look
  typing: boolean
  bob: number
  typeBeat: number
  sip: number
  steamT: number
  phase: number
  offset: number
  relaxing: boolean
  chair: { top: string; left: string; right: string }
}) {
  if (typing || relaxing) {
    return (
      <DeskBody
        look={look}
        chair={chair}
        relaxing={relaxing}
        bob={bob}
        typeBeat={typeBeat}
        phase={phase}
        offset={offset}
      />
    )
  }

  return <LoungeBody seat={seat} look={look} bob={bob} sip={sip} steamT={steamT} />
}

/** One projected anatomical frame: planted hips/legs, breathing only above the pelvis. */
function LoungeBody({ seat, look, bob, sip, steamT }: {
  seat: Seat; look: Look; bob: number; sip: number; steamT: number
}) {
  const pose = seatedPose(seat)
  const h = -pose.height
  const mugX = 9 - sip * 3
  const mugY = h - 7 - sip * 15
  return <G>
    {pose.legs.map((leg, i) => <G key={i}>
      <Path d={`M ${leg.hip.x} ${leg.hip.y} Q ${leg.hip.x + (leg.knee.x - leg.hip.x) * 0.6} ${leg.hip.y + 1} ${leg.knee.x} ${leg.knee.y} L ${leg.ankle.x} ${leg.ankle.y}`}
        stroke={i === 0 ? shade(look.pants, -15) : look.pants} strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Line x1={leg.ankle.x} y1={leg.ankle.y} x2={leg.toe.x} y2={leg.toe.y}
        stroke={pose.folded ? shade(look.skin, -12) : '#302A25'} strokeWidth={4.5} strokeLinecap="round" />
    </G>)}
    <G transform={`scale(${pose.mirror} 1)`}>
      <Path d={`M -8 ${h + 1} Q 0 ${h + 5} 8 ${h + 1} L 7 ${h - 7} L -7 ${h - 7} Z`} fill={look.pants} />
      <G transform={`translate(0 ${bob * 0.35})`}>
        <Path d={`M -8 ${h} L -10 ${h - 15} Q -7 ${h - 22} 2 ${h - 21} Q 10 ${h - 20} 10 ${h - 14} L 8 ${h + 1} Q 0 ${h + 3} -8 ${h} Z`}
          fill={pose.back ? look.shirtBack : look.shirt} />
        <Path d={`M -8 ${h - 17} Q -4 ${h - 10} -5 ${h + 1} L -8 ${h} Z`} fill={look.shirtDark} opacity={0.6} />
        <Path d={`M 6 ${h - 16} Q 13 ${h - 8} ${mugX + 2} ${mugY + 4}`} stroke={look.shirtDark} strokeWidth={5} fill="none" strokeLinecap="round" />
        <G transform={`translate(2 0) scale(0.94 1)`}>
          {pose.back
            ? <BackHead look={look} cy={h - 31} phase={0} turn={8} />
            : <Head look={look} typing={false} sip={sip * 0.25} phase={0} headY={h - 31} faceTurn={2.6} />}
        </G>
        {look.loungeProp === 2 ? <G>
          <Path d={`M -1 ${h - 6} L 8 ${h - 10} L 16 ${h - 4} L 7 ${h + 1} Z`} fill="#EDE1CA" stroke="#AD9776" strokeWidth={0.8} />
          <Path d={`M 8 ${h - 9} L 7 ${h} M 1 ${h - 5} L 5 ${h - 3}`} stroke="#AD9776" strokeWidth={0.8} />
        </G> : null}
        <Path d={`M -6 ${h - 17} Q -9 ${h - 7} -1 ${h - 6} L ${look.loungeProp === 2 ? 5 : mugX} ${look.loungeProp === 2 ? h - 3 : mugY + 4}`}
          stroke={look.shirt} strokeWidth={5} fill="none" strokeLinecap="round" />
        <Circle cx={look.loungeProp === 2 ? 5 : mugX} cy={look.loungeProp === 2 ? h - 3 : mugY + 4} r={2.6} fill={look.skin} />
        {look.loungeProp !== 2 ? <G transform={`translate(${mugX} ${mugY})`}>
          <Mug look={look} />
          <Steam x={1} y={-3} t={steamT} opacity={0.34} />
          {look.loungeProp === 1 ? <G transform="translate(-3 4) rotate(-15)">
            <Rect width={6} height={9} rx={1} fill="#292620" />
            <Rect x={1} y={1} width={4} height={6} fill="#8FB9C9" />
          </G> : null}
        </G> : null}
      </G>
    </G>
  </G>
}


/** A slow, occasional lean-back when a worker is idling at its desk. */
function leanBack(phase: number, offset: number): number {
  return Math.max(0, Math.sin(phase * 0.42 + offset * 1.3)) ** 6
}

/**
 * Desk work seen from behind: all desks face their monitors (`facing: 'up'`), so the worker is
 * between us and the screen. Back of the head, back of the shirt, arms reaching forward to the
 * keyboard, and the chair back laid over the lower back on the viewer side.
 */
function DeskBody({
  look,
  chair,
  relaxing,
  bob,
  typeBeat,
  phase,
  offset,
}: {
  look: Look
  chair: { top: string; left: string; right: string }
  relaxing: boolean
  bob: number
  typeBeat: number
  phase: number
  offset: number
}) {
  // Screen-facing nod while typing; slow look-around and an occasional lean-back on a break.
  const nod = relaxing
    ? Math.sin(phase * 0.55 + offset) * 1.6 - leanBack(phase, offset) * 2.4
    : Math.sin(phase * 1.7 + offset) * 1.1
  const turn = relaxing ? Math.sin(phase * 0.33 + offset * 0.7) * 6 : Math.sin(phase * 0.7 + offset) * 1.8
  const lean = relaxing ? leanBack(phase, offset) : 0
  const handBob = relaxing ? 0 : typeBeat * 0.9
  return (
    <G transform={`translate(0 ${bob - lean * 0.9})`}>
      {/* Occupied seat/back belong to this sprite; furniture renders only the chair base.
          Geometry is shared through CHAIR_SEAT_LOCAL / CHAIR_BACK_LOCAL. */}
      <Polygon
        points={CHAIR_SEAT_LOCAL.top}
        fill={shade(chair.top, -10)}
        stroke="#2A2119"
        strokeOpacity={0.32}
        strokeWidth={0.5}
      />
      {/* back of the shirt: shoulders slightly rounded, no collar or lanyard */}
      <Path
        d="M -11 -33 Q -11.5 -41 0 -41.4 Q 11.5 -41 11 -33 L 11 -20 Q 0 -17 -11 -20 Z"
        fill={look.shirtBack}
      />
      <Path d="M -7.5 -36.5 Q 0 -32.5 7.5 -36.5" stroke={look.shirtDark} strokeWidth={1.3} fill="none" opacity={0.55} />
      <Rect x={-2.2} y={-41} width={4.4} height={7} rx={1.6} fill={look.shirtDark} opacity={0.45} />

      {/* arms reach forward to the keyboard: elbows out at the sides, forearms hidden by the body */}
      <G stroke={look.shirtBack} strokeWidth={5} strokeLinecap="round" fill="none">
        <Path d="M -8.4 -38 L -12.8 -29.6 L -10.2 -34.6" />
        <Path d="M 8.4 -38 L 13.2 -29.6 L 11.4 -35.4" />
      </G>
      <G stroke={look.shirtDark} strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.4}>
        <Path d="M -9.4 -36.6 L -12.4 -30" />
        <Path d="M 9.4 -36.6 L 12.7 -30.2" />
      </G>
      {/* the visible hand on the keyboard, bobbing with the keystrokes */}
      <G transform={`translate(0 ${handBob})`}>
        <Ellipse cx={12} cy={-37.8} rx={2.6} ry={2.1} fill={look.skin} />
        <Path
          d="M 9.8 -38.4 L 14 -37.6"
          stroke={look.skin}
          strokeWidth={1.3}
          strokeLinecap="round"
          opacity={0.95}
        />
      </G>

      <BackHead look={look} cy={-48} phase={phase} nod={nod} turn={turn} rim />

      {/* screen rim light spilling onto the shoulder facing the monitor */}
      <Path
        d="M 5 -40.4 Q 10 -39 11.2 -34"
        stroke="#8FE3D0"
        strokeWidth={1.3}
        strokeLinecap="round"
        fill="none"
        opacity={0.16}
      />

      {/* Only the low, near chair back covers the worker's lower torso. */}
      <G>
        <Polygon
          points={CHAIR_BACK_LOCAL.left}
          fill={shade(chair.left, -16)}
          stroke="#2A2119"
          strokeOpacity={0.42}
          strokeWidth={0.6}
        />
        <Polygon
          points={CHAIR_BACK_LOCAL.right}
          fill={shade(chair.right, -12)}
          stroke="#2A2119"
          strokeOpacity={0.42}
          strokeWidth={0.6}
        />
        <Polygon
          points={CHAIR_BACK_LOCAL.top}
          fill={shade(chair.top, -8)}
          stroke="#2A2119"
          strokeOpacity={0.36}
          strokeWidth={0.6}
        />
        <Line
          x1={CHAIR_BACK_LOCAL.edge.x1}
          y1={CHAIR_BACK_LOCAL.edge.y1}
          x2={CHAIR_BACK_LOCAL.edge.x2}
          y2={CHAIR_BACK_LOCAL.edge.y2}
          stroke="#2A2119"
          strokeOpacity={0.3}
          strokeWidth={0.5}
        />
        <Line
          x1={CHAIR_BACK_LOCAL.highlight.x1}
          y1={CHAIR_BACK_LOCAL.highlight.y1}
          x2={CHAIR_BACK_LOCAL.highlight.x2}
          y2={CHAIR_BACK_LOCAL.highlight.y2}
          stroke="#F4EDE0"
          strokeOpacity={0.2}
          strokeWidth={1.2}
        />
      </G>
      <Polygon
        points={CHAIR_SEAT_LOCAL.front}
        fill={shade(chair.left, -16)}
        stroke="#2A2119"
        strokeOpacity={0.3}
        strokeWidth={0.5}
      />
      <Polygon
        points={CHAIR_SEAT_LOCAL.side}
        fill={shade(chair.right, -12)}
        stroke="#2A2119"
        strokeOpacity={0.3}
        strokeWidth={0.5}
      />
    </G>
  )
}

/** Back of the head: hair covers the skull, no eyes, mouth or blush. */
function BackHead({
  look,
  cy,
  phase,
  nod = 0,
  turn = 0,
  rim = false,
}: {
  look: Look
  cy: number
  phase: number
  nod?: number
  turn?: number
  rim?: boolean
}) {
  return (
    <G transform={`translate(1.4 0) rotate(${nod} 0 ${cy + 8}) rotate(${turn * 0.5} 0 ${cy + 9})`}>
      <Rect x={-3.6} y={cy + 7} width={7.2} height={7} rx={2.2} fill={look.skin} />
      <Circle cx={0} cy={cy} r={11} fill={look.skin} />
      {/* ears peek out at the sides of the hair */}
      <Circle cx={-10.6} cy={cy + 2.4} r={2.4} fill={look.skin} />
      <Circle cx={10.6} cy={cy + 2.4} r={2.4} fill={look.skin} />
      <BackHair look={look} cy={cy} />
      {look.accessory === 2 ? (
        <G>
          <Path
            d={`M -10.6 ${cy + 1} Q 0 ${cy - 16} 10.6 ${cy + 1}`}
            stroke="#2E2925"
            strokeWidth={2.7}
            fill="none"
          />
          <Rect x={-12.8} y={cy - 1} width={3.8} height={7.6} rx={1.9} fill="#2E2925" />
          <Rect x={9} y={cy - 1} width={3.8} height={7.6} rx={1.9} fill="#2E2925" />
        </G>
      ) : null}
      {rim ? (
        <G opacity={0.22}>
          <Path
            d={`M -3 ${cy - 12.4} Q 6 ${cy - 10.5} 9.6 ${cy - 3.5}`}
            stroke="#8FE3D0"
            strokeWidth={1.5}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d={`M 6.5 ${cy + 8} Q 9.5 ${cy + 5} 10.4 ${cy + 1}`}
            stroke="#8FE3D0"
            strokeWidth={1.1}
            strokeLinecap="round"
            fill="none"
            opacity={0.7}
          />
        </G>
      ) : null}
    </G>
  )
}

/** Hair from behind: a full cap over the skull, style variants kept from the front view. */
function BackHair({ look, cy }: { look: Look; cy: number }) {
  const c = look.hair
  const cap = `M -11 ${cy - 1} Q -12 ${cy - 16} 0 ${cy - 16} Q 12 ${cy - 16} 11 ${cy - 1} L 11 ${cy + 7} Q 6 ${cy + 10} 0 ${cy + 9.6} Q -6 ${cy + 10} -11 ${cy + 7} Z`
  if (look.hairStyle === 1) {
    return (
      <Path
        d={`M -11 ${cy - 1} Q -12 ${cy - 16} 0 ${cy - 16} Q 12 ${cy - 16} 11 ${cy - 1} L 11.4 ${cy + 11} Q 6 ${cy + 14} 0 ${cy + 13} Q -6 ${cy + 14} -11.4 ${cy + 11} Z`}
        fill={c}
      />
    )
  }
  if (look.hairStyle === 2) {
    return (
      <G>
        <Path d={cap} fill={c} />
        <Circle cx={0} cy={cy - 15} r={4.8} fill={c} />
      </G>
    )
  }
  if (look.hairStyle === 3) {
    return (
      <G fill={c}>
        <Path d={cap} fill={c} />
        <Circle cx={-8} cy={cy - 7} r={5.4} />
        <Circle cx={0} cy={cy - 11} r={6.2} />
        <Circle cx={8} cy={cy - 6} r={5.2} />
        <Circle cx={-9.6} cy={cy + 3} r={3.6} />
        <Circle cx={9.6} cy={cy + 3} r={3.6} />
      </G>
    )
  }
  if (look.hairStyle === 4) {
    return (
      <Path
        d={`M -11 ${cy - 1} Q -12 ${cy - 16} 0 ${cy - 16} Q 12 ${cy - 16} 11 ${cy - 1} L 11.4 ${cy + 16} Q 7 ${cy + 13} 4 ${cy + 15} Q 0 ${cy + 11} -4 ${cy + 15} Q -7 ${cy + 13} -11.4 ${cy + 16} Z`}
        fill={c}
      />
    )
  }
  if (look.hairStyle === 5) {
    return (
      <G>
        <Path d={cap} fill={c} />
        <Polygon
          points={`-10,${cy - 6} -12,${cy - 14} -6,${cy - 9} -6,${cy - 17} -1,${cy - 10} 2,${cy - 18} 5,${cy - 10} 9,${cy - 16} 9,${cy - 7} 12,${cy - 13} 11,${cy - 3}`}
          fill={c}
        />
      </G>
    )
  }
  return <Path d={cap} fill={c} />
}

function Mug({ look }: { look: Look }) {
  return (
    <G>
      <Rect x={-4} y={-8} width={8} height={8} rx={2} fill={look.mug} />
      <Rect x={-4} y={-8} width={8} height={2.2} rx={1} fill="#2A2017" opacity={0.28} />
      <Path d="M 4 -6.6 Q 7.4 -6.2 6.8 -3.6 Q 6.2 -1.8 4 -2.4" stroke={look.mug} strokeWidth={1.6} fill="none" />
    </G>
  )
}

function Steam({ x, y, t, opacity }: { x: number; y: number; t: number; opacity: number }) {
  return (
    <G opacity={opacity}>
      {[0, 1, 2].map((i) => {
        const phase = (t + i * 0.33) % 1
        const drift = (i - 1) * 2.4 + Math.sin((phase + i) * Math.PI * 2) * 1.6
        return (
          <Path
            key={i}
            d={`M ${x} ${y} q ${drift} -3 ${drift * 0.4} -6 q ${-drift * 0.3} -3 ${drift * 0.2} -6`}
            stroke="#F4EDE0"
            strokeWidth={1.25}
            strokeLinecap="round"
            fill="none"
            opacity={0.8 * (1 - phase)}
            transform={`translate(0 ${-phase * 3})`}
          />
        )
      })}
    </G>
  )
}

function Head({
  look,
  typing,
  sip,
  phase,
  headY,
  offset = 0,
  faceTurn = 0,
}: {
  look: Look
  typing: boolean
  sip: number
  phase: number
  headY?: number
  offset?: number
  faceTurn?: number
}) {
  const cy = headY ?? -48
  const blink = Math.sin(phase * 1.9 + offset) > 0.985
  return (
    <G>
      <Rect x={-3.5} y={cy + 8} width={7} height={6} rx={2} fill={look.skin} />
      <Circle cx={0} cy={cy} r={11} fill={look.skin} />
      <Hair look={look} cy={cy} />
      {look.accessory === 2 ? (
        <G>
          <Path d={`M -11 ${cy - 1} Q 0 ${cy - 15} 11 ${cy - 1}`} stroke="#2E2925" strokeWidth={2.6} fill="none" />
          <Rect x={-13} y={cy - 3} width={3.4} height={7} rx={1.7} fill="#2E2925" />
          <Rect x={9.6} y={cy - 3} width={3.4} height={7} rx={1.7} fill="#2E2925" />
        </G>
      ) : null}
      {typing ? (
        <G>
          <Path d={`M -8 ${cy - 2} Q 0 ${cy - 6} 8 ${cy - 2}`} stroke={look.hair} strokeWidth={4} fill="none" opacity={0.55} />
          <Rect x={-5} y={cy + 5} width={10} height={2.2} rx={1.1} fill={look.skin} opacity={0.5} />
        </G>
      ) : (
        <G transform={`translate(${faceTurn} 0) rotate(${-sip * 5} 0 ${cy + 4})`}>
          <Circle cx={-4.2} cy={cy + 0.4} r={1.15} fill="#2A201A" opacity={blink ? 0.15 : 0.9} />
          <Circle cx={4.2} cy={cy + 0.4} r={1.15} fill="#2A201A" opacity={blink ? 0.15 : 0.9} />
          <Ellipse cx={-7} cy={cy + 4} rx={2.2} ry={1.2} fill="#D97757" opacity={0.28} />
          <Ellipse cx={7} cy={cy + 4} rx={2.2} ry={1.2} fill="#D97757" opacity={0.28} />
          <Path
            d={`M -2.2 ${cy + 5.4} Q 0 ${cy + 7} 2.2 ${cy + 5.4}`}
            stroke="#7A4A36"
            strokeWidth={1}
            strokeLinecap="round"
            fill="none"
          />
          {look.accessory === 1 ? (
            <G stroke="#2C2420" strokeWidth={0.9} fill="none" opacity={0.85}>
              <Circle cx={-4.2} cy={cy + 0.4} r={3.1} />
              <Circle cx={4.2} cy={cy + 0.4} r={3.1} />
              <Line x1={-1.1} y1={cy} x2={1.1} y2={cy} />
            </G>
          ) : null}
          {look.accessory === 4 ? (
            <Path
              d={`M -8 ${cy + 8} Q 0 ${cy + 11} 8 ${cy + 8}`}
              stroke={look.shirtDark}
              strokeWidth={2.6}
              fill="none"
            />
          ) : null}
        </G>
      )}
    </G>
  )
}

function Hair({ look, cy }: { look: Look; cy: number }) {
  const c = look.hair
  const style = look.hairStyle
  if (style === 1) {
    return (
      <Path
        d={`M -11 ${cy - 1} Q -12 ${cy - 15} 0 ${cy - 15} Q 12 ${cy - 15} 11 ${cy - 1} L 10 ${cy + 6} Q 6 ${cy + 1} 0 ${cy + 1} Q -6 ${cy + 1} -10 ${cy + 6} Z`}
        fill={c}
      />
    )
  }
  if (style === 2) {
    return (
      <G>
        <Circle cx={0} cy={cy - 14} r={4.6} fill={c} />
        <Path d={`M -11 ${cy - 2} Q -11 ${cy - 15} 0 ${cy - 15} Q 11 ${cy - 15} 11 ${cy - 2} Q 5 ${cy - 7} 0 ${cy - 6} Q -5 ${cy - 7} -11 ${cy - 2} Z`} fill={c} />
      </G>
    )
  }
  if (style === 3) {
    return (
      <G fill={c}>
        <Circle cx={-8} cy={cy - 7} r={5.2} />
        <Circle cx={0} cy={cy - 11} r={6} />
        <Circle cx={8} cy={cy - 6} r={5} />
        <Circle cx={-9.5} cy={cy} r={3.2} />
        <Circle cx={9.5} cy={cy} r={3.2} />
      </G>
    )
  }
  if (style === 4) {
    return (
      <Path
        d={`M -11 ${cy - 4} Q -12 ${cy - 16} 0 ${cy - 16} Q 12 ${cy - 16} 11 ${cy - 4} L 11 ${cy + 12} Q 8 ${cy + 10} 7 ${cy + 2} Q 4 ${cy - 6} 0 ${cy - 6} Q -4 ${cy - 6} -7 ${cy + 2} Q -8 ${cy + 10} -11 ${cy + 12} Z`}
        fill={c}
      />
    )
  }
  if (style === 5) {
    return (
      <G fill={c}>
        <Polygon points={`-11,${cy - 3} -8,${cy - 15} -5,${cy - 5} -2,${cy - 17} 1,${cy - 5} 5,${cy - 16} 7,${cy - 4} 10,${cy - 12} 11,${cy - 2}`} />
        <Path d={`M -10 ${cy - 2} Q 0 ${cy - 9} 10 ${cy - 2}`} stroke={c} strokeWidth={5} fill="none" />
      </G>
    )
  }
  return (
    <Path
      d={`M -11 ${cy - 1} Q -11 ${cy - 14} 0 ${cy - 14} Q 11 ${cy - 14} 11 ${cy - 1} Q 7 ${cy - 7} 0 ${cy - 7} Q -7 ${cy - 7} -11 ${cy - 1} Z`}
      fill={c}
    />
  )
}

function Confetti({
  x,
  y,
  now,
  enteredAt,
  seed,
}: {
  x: number
  y: number
  now: number
  enteredAt: number
  seed: string
}) {
  const elapsed = Math.max(0, (now - enteredAt) / 1000)
  if (elapsed > 2.9) return null
  const burst = Math.min(1, elapsed / 1.1)
  return (
    <G opacity={Math.max(0, 1 - elapsed / 2.9)}>
      <SvgText
        x={x}
        y={y - 76 - elapsed * 6}
        textAnchor="middle"
        fontSize={7.5}
        fontFamily="DMSans_700Bold"
        fill="#F3C57A"
        opacity={Math.max(0, 1 - elapsed / 2.2)}
      >
        new hire!
      </SvgText>
      {Array.from({ length: 15 }).map((_, i) => {
        const angle = (i / 15) * Math.PI * 2 + hashIndex(seed, i, 10) / 20
        const speed = 16 + hashIndex(seed, i + 20, 18)
        const dx = Math.cos(angle) * speed * burst
        const dy = Math.sin(angle) * speed * 0.55 * burst + elapsed * elapsed * 13
        const color = CONFETTI[i % CONFETTI.length]
        const rot = hashIndex(seed, i + 40, 360) + elapsed * 160
        return (
          <Rect
            key={i}
            x={x + dx}
            y={y - 34 + dy}
            width={3.4}
            height={2}
            rx={0.6}
            fill={color}
            transform={`rotate(${rot} ${x + dx} ${y - 34 + dy})`}
          />
        )
      })}
    </G>
  )
}
