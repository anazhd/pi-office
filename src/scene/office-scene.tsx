import { memo } from 'react'
import { shortTagName } from './short-tag-name'
import { G, Svg } from 'react-native-svg'
import type { OfficeSnapshot } from '@/api/types'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { Backdrop } from './backdrop'
import { CharacterSprite, CharacterTag } from './character-sprite'
import { sortBackToFront } from './depth'
import { deskLights } from './desk-lights'
import { buildFurniture } from './furniture'
import { armchairForegroundKeys, characterBounds, furnitureContaining, seatFurnitureKeys } from './furniture-bounds'
import { VIEWBOX } from './iso'
import { resolveFestive, type FestiveOverride } from './festive'
import { FestiveDecor, FestiveOutside } from './festive-layers'
import { resolveSeason, type Season } from './season'
import { SeasonClips, SeasonDecor, SeasonOutside, WindowFrames } from './season-layers'
import { skyPhase } from './sky'
import type { SceneItem } from './types'
import { useSceneModel } from './use-scene-model'

const StaticBackdrop = memo(Backdrop)
const StaticSeasonClips = memo(SeasonClips)
const StaticWindowFrames = memo(WindowFrames)
const StaticSeasonDecor = memo(SeasonDecor)
const StaticFestiveOutside = memo(FestiveOutside)
const StaticFestiveDecor = memo(FestiveDecor)

type Props = {
  snapshot: OfficeSnapshot | null
  now: number
  selectedId: string | null
  onSelect: (id: string) => void
  /** ?season= or EXPO_PUBLIC_OFFICE_SEASON; null means "follow the calendar". */
  seasonOverride?: Season | null
  /** ?festive= or EXPO_PUBLIC_OFFICE_FESTIVE; null/auto means "follow the local calendar". */
  festiveOverride?: FestiveOverride | null
}

export function OfficeScene({
  snapshot,
  now,
  selectedId,
  onSelect,
  seasonOverride,
  festiveOverride,
}: Props) {
  const characters = useSceneModel(snapshot, now)
  const reducedMotion = useReducedMotion()

  // The wall dressing only changes every minute or so, so it shares one coarse clock.
  const sceneClock = Math.floor(now / 30000) * 30000
  const season = resolveSeason(sceneClock, seasonOverride)
  // The festive overlay is independent: it never changes the season, the season never changes it.
  const festive = resolveFestive(sceneClock, festiveOverride)
  const phase = skyPhase(sceneClock)
  const night = phase === 'night'

  // Monitors light up while someone types (see desk-lights.ts). Chairs drop their back whenever a worker
  // sprite sits in them (typing OR relaxing at the desk), because the sprite draws its own seat and back.
  const { lit, seated } = deskLights(characters)

  const items: SceneItem[] = buildFurniture(lit, now, seated)

  for (const scene of characters) {
    // A character is a small column at its feet, ordered like any other box: behind a sofa it
    // is hidden by it, in front of it it draws on top. The only exception is furniture the
    // character is inside of (its own seat, or the chair it is standing up from), which it
    // always draws after.
    const own = new Set(furnitureContaining(scene.gx, scene.gy))
    if (!scene.walking) for (const key of seatFurnitureKeys(scene.seat, scene.deskIndex)) own.add(key)
    // Camera-side solid panels cover the occupant; only the base/cushion and far arm
    // belong behind it. Feet beyond the open west edge remain unobstructed.
    if (!scene.walking && scene.seat.kind === 'armchair') {
      for (const key of armchairForegroundKeys(scene.seat)) {
        own.delete(key)
        const panel = items.find((item) => item.key === key)
        if (panel) panel.after = [...(panel.after ?? []), `char-${scene.char.id}`]
      }
    }
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

  return (
    <Svg viewBox={VIEWBOX} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <StaticSeasonClips />
      <StaticBackdrop
        activeSessions={snapshot?.totals.activeSessions ?? 0}
        now={sceneClock}
        season={season}
      />
      {/* weather outside the glass, then the frames so it falls behind the mullions */}
      <SeasonOutside season={season} phase={phase} t={reducedMotion ? null : now} />
      <StaticFestiveOutside festive={festive} night={night} />
      <StaticWindowFrames night={night} season={season} />
      <StaticSeasonDecor season={season} night={night} />
      {/* dated overlay, on top of whatever season it is and behind every solid object */}
      <StaticFestiveDecor festive={festive} phase={phase} />
      {ordered.map((item) => (
        <G key={item.key}>{item.node}</G>
      ))}
      {/* Head-level name tags stay in a top overlay so they remain readable. */}
      {characters.map((scene) => (
        <CharacterTag
          key={`tag-${scene.char.id}`}
          tagName={shortTagName(scene.char, snapshot?.characters)}
          scene={scene}
          now={now}
          selected={selectedId === scene.char.id}
          dense={characters.length > 9}
          onSelect={onSelect}
        />
      ))}
    </Svg>
  )
}
