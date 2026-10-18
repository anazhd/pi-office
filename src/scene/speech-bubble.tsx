import { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg'
import type { Character } from '@/api/types'
import type { SceneCharacter } from './use-scene-model'
import { iso } from './iso'
import { providerColor } from './palette'

const TOOL_ICONS: Record<string, string> = {
  bash: '▶',
  exec: '▶',
  read: '📖',
  edit: '✏️',
  write: '📝',
  web_search: '🔎',
  search: '🔎',
  fetch_content: '🌐',
  fetch: '🌐',
  grep: '🔍',
  ls: '🗂',
  glob: '🗂',
}

const TOOL_LABELS: Record<string, string> = {
  bash: 'bash',
  exec: 'exec',
  read: 'read',
  edit: 'edit',
  write: 'write',
  web_search: 'web search',
  fetch_content: 'fetch page',
  grep: 'grep',
  ls: 'list files',
  glob: 'find files',
}

export function toolGlyph(tool: string): { icon: string; label: string } {
  if (tool.startsWith('mcp__')) {
    const short = tool.split('__').pop() ?? tool
    return { icon: '🧩', label: short.replace(/_/g, ' ') }
  }
  return {
    icon: TOOL_ICONS[tool] ?? '⚙',
    label: TOOL_LABELS[tool] ?? tool.replace(/_/g, ' '),
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function SpeechBubble({ scene, now }: { scene: SceneCharacter; now: number }) {
  const { char, gx, gy } = scene
  if (char.status === 'idle') return null
  const { x } = iso(gx, gy)
  const baseY = iso(gx, gy).y - 76 - scene.bubbleLane * 52
  const provider = providerColor(char.provider, char.model)

  if (scene.pose === 'waiting') {
    return (
      <G>
        <BubbleShell x={x} y={baseY} width={96} height={26} provider={provider} char={char} />
        <SvgText
          x={x}
          y={baseY + 16.5}
          textAnchor="middle"
          fontSize={7.6}
          fontFamily="DMSans_500Medium"
          fill="#7B6A57"
        >
          waiting for a desk
        </SvgText>
      </G>
    )
  }

  if (char.status === 'thinking') {
    return (
      <G>
        <BubbleShell x={x} y={baseY} width={74} height={30} provider={provider} char={char} />
        <SvgText
          x={x - 18}
          y={baseY + 12.5}
          textAnchor="middle"
          fontSize={7.5}
          fontFamily="DMSans_500Medium"
          fill="#7B6A57"
        >
          thinking
        </SvgText>
        {[0, 1, 2].map((i) => {
          const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 190 - i * 0.75))
          return (
            <Circle
              key={i}
              cx={x + 2 + i * 7}
              cy={baseY + 10}
              r={2.1}
              fill="#3A2E24"
              opacity={pulse}
            />
          )
        })}
        <ProjectLine x={x} y={baseY + 23} project={char.active[0]?.project} width={74} />
      </G>
    )
  }

  const tool = char.active[0]?.tool ?? 'tool'
  const { icon, label } = toolGlyph(tool)
  const short = truncate(label, 18)
  const project = char.active[0]?.project ?? ''
  const width = Math.max(80, short.length * 5.1 + 30, truncate(project, 20).length * 3.9 + 18)

  return (
    <G>
      <BubbleShell x={x} y={baseY} width={width} height={36} provider={provider} char={char} />
      <SvgText x={x - width / 2 + 8} y={baseY + 14.5} fontSize={9.5} fill="#3A2E24">
        {icon}
      </SvgText>
      <SvgText
        x={x - width / 2 + 21}
        y={baseY + 14}
        fontSize={8.6}
        fontFamily="DMSans_500Medium"
        fill="#2E241B"
      >
        {short}
      </SvgText>
      <ProjectLine x={x} y={baseY + 28} project={project} width={width} />
    </G>
  )
}

function BubbleShell({
  x,
  y,
  width,
  height,
  provider,
  char,
}: {
  x: number
  y: number
  width: number
  height: number
  provider: string
  char: Character
}) {
  const multi = char.active.length > 1
  return (
    <G>
      <Rect
        x={x - width / 2 + 1.5}
        y={y + 1.8}
        width={width}
        height={height}
        rx={7}
        fill="#120D09"
        opacity={0.3}
      />
      <Rect
        x={x - width / 2}
        y={y}
        width={width}
        height={height}
        rx={7}
        fill="#F7EFDF"
        stroke={provider}
        strokeOpacity={0.32}
        strokeWidth={0.8}
      />
      <Path
        d={`M ${x - 4.5} ${y + height - 0.8} L ${x} ${y + height + 6} L ${x + 4.5} ${y + height - 0.8} Z`}
        fill="#F7EFDF"
      />
      {multi ? (
        <G>
          <Rect
            x={x + width / 2 - 19}
            y={y - 7}
            width={22}
            height={13}
            rx={6.5}
            fill="#2A2118"
          />
          <SvgText
            x={x + width / 2 - 8}
            y={y + 2.6}
            textAnchor="middle"
            fontSize={7.2}
            fontFamily="DMSans_700Bold"
            fill="#F3C57A"
          >
            ×{char.active.length}
          </SvgText>
        </G>
      ) : null}
    </G>
  )
}

function ProjectLine({
  x,
  y,
  project,
  width,
}: {
  x: number
  y: number
  project?: string
  width: number
}) {
  if (!project) return null
  return (
    <SvgText
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={6.8}
      fontFamily="DMSans_400Regular"
      fill="#8A7863"
      opacity={0.95}
    >
      {truncate(project, Math.floor((width - 12) / 3.6))}
    </SvgText>
  )
}
