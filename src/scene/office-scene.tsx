import { memo } from 'react'
import { G, Svg } from 'react-native-svg'
import type { OfficeSnapshot } from '@/api/types'
import { Backdrop } from './backdrop'
import { CharacterSprite, CharacterTag } from './character-sprite'
import { buildFurniture } from './furniture'
import { VIEWBOX } from './iso'
import { SpeechBubble } from './speech-bubble'
import { seatDepth } from './layout'
import { useSceneModel } from './use-scene-model'

const StaticBackdrop = memo(Backdrop)

type Props = {
  snapshot: OfficeSnapshot | null
  now: number
  selectedId: string | null
  onSelect: (id: string) => void
}

export function OfficeScene({ snapshot, now, selectedId, onSelect }: Props) {
  const characters = useSceneModel(snapshot, now)
  const occupied = new Set<number>()
  for (const scene of characters) {
    if (scene.deskIndex != null && scene.pose === 'typing') occupied.add(scene.deskIndex)
  }

  const items = buildFurniture(occupied, now)

  for (const scene of characters) {
    // Walking characters must stay above the floor furniture they pass; seated
    // characters use their own seat's depth so they render just after it.
    const depth =
      scene.pose === 'walking'
        ? scene.gx + scene.gy + 7.5
        : seatDepth(scene.seat)
    items.push({
      key: `char-${scene.char.id}`,
      depth,
      node: (
        <CharacterSprite
          scene={scene}
          now={now}
          selected={selectedId === scene.char.id}
          dense={characters.length > 9}
          onSelect={onSelect}
        />
      ),
    })
  }

  items.sort((a, b) => a.depth - b.depth)

  const talking = characters.filter((scene) => scene.pose === 'typing' || scene.pose === 'waiting')

  return (
    <Svg viewBox={VIEWBOX} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <StaticBackdrop
        activeSessions={snapshot?.totals.activeSessions ?? 0}
        now={Math.floor(now / 30000) * 30000}
      />
      {items.map((item) => (
        <G key={item.key}>{item.node}</G>
      ))}
      {characters.map((scene) => (
        <CharacterTag
          key={`tag-${scene.char.id}`}
          scene={scene}
          now={now}
          selected={selectedId === scene.char.id}
          dense={characters.length > 9}
          onSelect={onSelect}
        />
      ))}
      {talking.map((scene) => (
        <SpeechBubble key={`bubble-${scene.char.id}`} scene={scene} now={now} />
      ))}
    </Svg>
  )
}
