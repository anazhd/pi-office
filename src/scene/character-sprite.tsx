import { Circle, Ellipse, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg'
import type { Seat, SeatKind } from './layout'
import type { SceneCharacter } from './use-scene-model'
import { hashIndex, iso } from './iso'
import { lookFor, type Look } from './palette'

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
  const seatedLow = scene.seat.kind === 'beanbag' || scene.seat.kind === 'cushion'

  const walking = pose === 'walking'
  const waiting = pose === 'waiting'
  const typing = pose === 'typing'
  const bob = walking || waiting ? 0 : Math.sin(phase * 1.5 + offset) * 1
  const stride = Math.sin(phase * 9 + offset)
  const typeBeat = Math.sin(phase * 7.5 + offset) * 1.2

  const sipPeriod = 7 + (hashIndex(char.id, 12, 55) / 10)
  const sipPhase = ((phase + offset) % sipPeriod)
  const sip = !walking && !typing && sipPhase < 1.3 ? Math.sin((sipPhase / 1.3) * Math.PI) : 0

  const steamT = (phase * 0.45 + offset * 0.1) % 1
  const mugX = typing ? 0 : 12
  const mugY = typing ? -20 : seatedLow ? -22 : -26

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
            stride={walking ? stride : 0}
            phase={phase}
            still={waiting}
          />
        ) : (
          <SeatedBody
            look={look}
            typing={typing}
            low={seatedLow}
            seatedOnWindow={scene.seat.kind === 'window'}
            bob={bob}
            typeBeat={typeBeat}
            sip={sip}
            mugX={mugX}
            mugY={mugY}
            steamT={steamT}
            phase={phase}
            offset={offset}
            prop={look.loungeProp}
          />
        )}

      </G>

      {scene.confetti ? (
        <Confetti x={x} y={y} now={now} enteredAt={scene.enteredAt} seed={char.id} />
      ) : null}

      {typing ? (
        <G>
          <Ellipse cx={x - 12} cy={y - 22} rx={22} ry={18} fill="#8FE3D0" opacity={0.04} />
        </G>
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
      <NameTag
        look={look}
        char={char}
        selected={selected}
        dense={dense}
        lane={seatLane(scene.seat)}
      />
    </G>
  )
}

const SEAT_GROUP_START: Partial<Record<SeatKind, number>> = {
  desk: 1,
  sofa: 1,
  armchair: 4,
  beanbag: 6,
  window: 10,
  ottoman: 12,
  cushion: 14,
}

/** Stagger tags within a furniture group so neighbours do not cover each other. */
function seatLane(seat: Seat): number {
  const num = Number(seat.id.replace(/^\D+/, ''))
  // Overflow desks and standing spots sit about one tile apart, so cycle the lanes to keep name tags apart.
  if (seat.row === 3 && Number.isFinite(num)) return (num - 11) % 4
  if (seat.kind === 'standing' && Number.isFinite(num)) return num % 4
  const start = SEAT_GROUP_START[seat.kind]
  if (start != null && Number.isFinite(num)) return Math.max(0, Math.min(3, num - start))
  return hashIndex(seat.id, 15, 3)
}

function NameTag({
  look,
  char,
  selected,
  dense,
  lane,
}: {
  look: Look
  char: SceneCharacter['char']
  selected: boolean
  dense: boolean
  lane: number
}) {
  const full = selected || char.status !== 'idle' || !dense
  const name = full ? char.displayName : char.displayName.split(' ')[0]
  const width = Math.max(30, name.length * 3.7 + 11)
  const tagY = lane * 7
  return (
    <G>
      <Rect
        x={-width / 2}
        y={4 + tagY}
        width={width}
        height={9.6}
        rx={5.4}
        fill="#15110D"
        opacity={selected ? 0.94 : 0.64}
        stroke={selected ? '#E9A94C' : look.shirt}
        strokeOpacity={selected ? 0.9 : 0.38}
        strokeWidth={0.8}
      />
      <SvgText
        x={-3.5}
        y={11.2 + tagY}
        textAnchor="middle"
        fontSize={6.2}
        fontFamily="DMSans_500Medium"
        fill="#F4EDE0"
      >
        {name}
      </SvgText>
      <Circle cx={width / 2 + 4.6} cy={4 + tagY + 4.8} r={4.4} fill="#E9A94C" />
      <SvgText
        x={width / 2 + 4.6}
        y={4 + tagY + 6.9}
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

function WalkingBody({
  look,
  stride,
  phase,
  still = false,
}: {
  look: Look
  stride: number
  phase: number
  still?: boolean
}) {
  const bounce = still ? 0 : Math.abs(Math.sin(phase * 9)) * 1.8
  const legA = stride * 20
  const legB = -stride * 20
  return (
    <G transform={`translate(0 ${-bounce})`}>
      <G transform={`rotate(${legA} -6 -16)`}>
        <Rect x={-9} y={-18} width={6} height={18} rx={3} fill={look.pants} />
        <Rect x={-10.5} y={-3} width={9} height={4} rx={2} fill="#2E2924" />
      </G>
      <G transform={`rotate(${legB} 6 -16)`}>
        <Rect x={3} y={-18} width={6} height={18} rx={3} fill={look.pants} />
        <Rect x={2.5} y={-3} width={9} height={4} rx={2} fill="#2E2924" />
      </G>

      <Arm look={look} x={-11} y={-37} swing={stride * 16} />
      <Arm look={look} x={11} y={-37} swing={-stride * 16} />

      <Rect x={-11} y={-41} width={22} height={25} rx={8} fill={look.shirt} />
      <Path d="M -10 -39 L 0 -33 L 10 -39" stroke={look.shirtDark} strokeWidth={2} fill="none" />
      <Rect x={-5.5} y={-37.5} width={11} height={8} rx={2} fill="#F4EDE0" opacity={0.9} />
      <Rect x={-3.5} y={-35.4} width={7} height={1.4} rx={0.7} fill={look.shirtDark} opacity={0.6} />

      <Head look={look} typing={false} sip={0} phase={phase} />
    </G>
  )
}

function Arm({ look, x, y, swing }: { look: Look; x: number; y: number; swing: number }) {
  return (
    <G transform={`rotate(${swing} ${x} ${y})`}>
      <Rect x={x - 2.6} y={y} width={5.2} height={16} rx={2.6} fill={look.shirtDark} />
      <Circle cx={x} cy={y + 17} r={3.1} fill={look.skin} />
    </G>
  )
}

function SeatedBody({
  look,
  typing,
  low,
  seatedOnWindow,
  bob,
  typeBeat,
  sip,
  mugX,
  mugY,
  steamT,
  phase,
  offset,
  prop,
}: {
  look: Look
  typing: boolean
  low: boolean
  seatedOnWindow: boolean
  bob: number
  typeBeat: number
  sip: number
  mugX: number
  mugY: number
  steamT: number
  phase: number
  offset: number
  prop: number
}) {
  const drop = low ? 7 : 0
  const torsoTop = low ? -33 : -39
  const headY = (low ? -41 : -48) + bob
  const shirtH = low ? 20 : 24

  if (typing) {
    return (
      <G>
        <ChairBack look={look} />
        <G transform={`translate(0 ${bob})`}>
          <Rect x={-10} y={-18} width={7} height={17} rx={3.5} fill={look.pants} />
          <Rect x={3} y={-18} width={7} height={17} rx={3.5} fill={look.pants} />
          <Rect x={-11} y={-41} width={22} height={25} rx={8} fill={look.shirt} />
          <Path d="M -9 -39 Q 0 -32 9 -39" stroke={look.shirtDark} strokeWidth={2} fill="none" />
          <G transform={`translate(0 ${typeBeat})`}>
            <Rect x={-13} y={-22} width={5} height={12} rx={2.5} fill={look.shirtDark} />
            <Rect x={8} y={-22} width={5} height={12} rx={2.5} fill={look.shirtDark} />
            <Circle cx={-10.5} cy={-9} r={3} fill={look.skin} />
            <Circle cx={10.5} cy={-9} r={3} fill={look.skin} />
          </G>
          <Head look={look} typing phase={phase} sip={0} />
        </G>
      </G>
    )
  }

  return (
    <G transform={`translate(0 ${drop + bob})`}>
      {seatedOnWindow ? (
        <G>
          <Rect x={-9} y={-15} width={7} height={15} rx={3.5} fill={look.pants} />
          <Rect x={2} y={-15} width={7} height={15} rx={3.5} fill={look.pants} />
          <Rect x={-10.5} y={-3} width={8} height={4} rx={2} fill="#2E2924" />
          <Rect x={2.5} y={-3} width={8} height={4} rx={2} fill="#2E2924" />
        </G>
      ) : low ? (
        <G>
          <Path
            d="M -11 -10 Q -12 -3 0 -4 Q 12 -3 11 -10"
            stroke={look.pants}
            strokeWidth={7}
            strokeLinecap="round"
            fill="none"
          />
          <Ellipse cx={-8} cy={-3.5} rx={5} ry={3.2} fill="#2E2924" />
          <Ellipse cx={8} cy={-3.5} rx={5} ry={3.2} fill="#2E2924" />
          <Path d="M -9 -8 Q 0 -12 9 -8" stroke={look.pants} strokeWidth={6} strokeLinecap="round" />
        </G>
      ) : (
        <G>
          <Path
            d="M -7 -17 L -7 -6 L -4 -3"
            stroke={look.pants}
            strokeWidth={7}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 7 -17 L 7 -6 L 4 -3"
            stroke={look.pants}
            strokeWidth={7}
            strokeLinecap="round"
            fill="none"
          />
          <Ellipse cx={-4} cy={-2.4} rx={4.6} ry={3} fill="#2E2924" />
          <Ellipse cx={4} cy={-2.4} rx={4.6} ry={3} fill="#2E2924" />
        </G>
      )}

      {prop === 2 ? (
        <G transform="rotate(-6 0 -18)">
          <Rect x={-9} y={-20} width={18} height={12} rx={1.5} fill="#F0E4CF" />
          <Rect x={-9} y={-20} width={18} height={3} rx={1.5} fill="#D9C7A8" />
          <Line x1={-6} y1={-14} x2={4} y2={-14} stroke="#A99677" strokeWidth={1} />
        </G>
      ) : null}

      <Rect x={-11} y={torsoTop} width={22} height={shirtH} rx={7.5} fill={look.shirt} />
      <Path
        d={`M -9 ${torsoTop + 2} Q 0 ${torsoTop + 9} 9 ${torsoTop + 2}`}
        stroke={look.shirtDark}
        strokeWidth={2}
        fill="none"
      />
      <Rect x={-5} y={torsoTop + 5} width={10} height={7.5} rx={2} fill="#F4EDE0" opacity={0.88} />
      <Rect
        x={-3.2}
        y={torsoTop + 6.9}
        width={6.4}
        height={1.3}
        rx={0.65}
        fill={look.shirtDark}
        opacity={0.55}
      />
      <Rect
        x={-3.2}
        y={torsoTop + 9.2}
        width={4.4}
        height={1.1}
        rx={0.55}
        fill={look.shirtDark}
        opacity={0.35}
      />

      <G transform={`rotate(${-sip * 8} 11 ${torsoTop + 3}) translate(${-sip * 3} ${-sip * 12})`}>
        <Rect x={8.6} y={-26} width={5} height={13} rx={2.5} fill={look.shirtDark} />
        <Circle cx={11} cy={-12} r={3.2} fill={look.skin} />
        <G transform={`translate(${mugX - 11} ${mugY + 12})`}>
          <Mug look={look} />
          {prop === 1 ? (
            <G transform="translate(9 -1) rotate(10)">
              <Rect x={0} y={0} width={7} height={11} rx={1.8} fill="#26221E" />
              <Rect x={1.3} y={1.5} width={4.4} height={7} rx={0.8} fill="#8FB9C9" opacity={0.8} />
            </G>
          ) : null}
        </G>
        <Steam x={mugX + 1} y={mugY - 3} t={steamT} opacity={0.34} />
      </G>

      <Rect x={-11} y={-31} width={5.4} height={12} rx={2.7} fill={look.shirtDark} />
      <Circle cx={-8.2} cy={-18} r={3} fill={look.skin} />

      <Head look={look} typing={false} sip={sip} phase={phase} headY={headY} offset={offset} />
    </G>
  )
}

function ChairBack({ look }: { look: Look }) {
  return (
    <G>
      <Rect x={-13} y={-36} width={26} height={22} rx={5} fill={look.shirtDark} opacity={0.55} />
      <Rect x={-11} y={-34} width={22} height={18} rx={4} fill="#40382F" />
    </G>
  )
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
}: {
  look: Look
  typing: boolean
  sip: number
  phase: number
  headY?: number
  offset?: number
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
        <G transform={`rotate(${-sip * 5} 0 ${cy + 4})`}>
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
