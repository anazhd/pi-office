import { memo, useMemo } from 'react'
import { G, Svg } from 'react-native-svg'
import type { OfficeSnapshot } from '@/api/types'
import { Backdrop } from './backdrop'
import { CharacterSprite, CharacterTag } from './character-sprite'
import { sortBackToFront } from './depth'
import { buildFurniture } from './furniture'
import { characterBounds, furnitureContaining, seatFurnitureKeys } from './furniture-bounds'
import { VIEWBOX } from './iso'
import { SpeechBubble } from './speech-bubble'
import type { SceneItem } from './types'
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

  // Monitors light up while someone types. Chairs drop their back whenever a worker sprite sits in
  // them (typing OR relaxing at the desk), because the sprite draws its own seat and back.
  const lit = new Set<number>()
  const seated = new Set<number>()
  for (const scene of characters) {
    if (scene.deskIndex == null || scene.pose === 'walking') continue
    if (scene.pose === 'typing') lit.add(scene.deskIndex)
    if (scene.pose === 'typing' || scene.pose === 'relaxing') seated.add(scene.deskIndex)
  }

  const items: SceneItem[] = buildFurniture(lit, now, seated)

  for (const scene of characters) {
    // A character is a small column at its feet, ordered like any other box: behind a sofa it
    // is hidden by it, in front of it it draws on top. The only exception is furniture the
    // character is inside of (its own seat, or the chair it is standing up from), which it
    // always draws after.
    const own = new Set(furnitureContaining(scene.gx, scene.gy))
    if (!scene.walking) for (const key of seatFurnitureKeys(scene.seat, scene.deskIndex)) own.add(key)
    const bounds = characterBounds(scene)
    items.push({
      key: `char-${scene.char.id}`,
      bounds,
      after: [...own],
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

  const ordered = sortBackToFront(items)

  const talking = useMemo(
    () => characters.filter((scene) => scene.pose === 'typing' || scene.pose === 'waiting'),
    [characters],
  )

  return (
    <Svg viewBox={VIEWBOX} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <StaticBackdrop
        activeSessions={snapshot?.totals.activeSessions ?? 0}
        now={Math.floor(now / 30000) * 30000}
      />
      {ordered.map((item) => (
        <G key={item.key}>{item.node}</G>
      ))}
      {/* Name tags and speech bubbles stay in a top overlay so they are always readable. */}
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
