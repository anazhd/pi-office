import { useMemo, useState } from 'react'
import { Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useOffice } from '@/hooks/use-office'
import { useTick } from '@/hooks/use-tick'
import { parseFestive, type FestiveOverride } from '@/scene/festive'
import { OfficeScene } from '@/scene/office-scene'
import { parseSeason, type Season } from '@/scene/season'
import { ActivityTicker } from './activity-ticker'
import { CharacterCard } from './character-card'
import { RosterStrip } from './roster-strip'
import { TopBar } from './top-bar'

const SCENE_RATIO = 820 / 612

// Written out in full so Expo inlines it at build time. An invalid value is ignored.
const ENV_SEASON = parseSeason(process.env.EXPO_PUBLIC_OFFICE_SEASON)
const ENV_FESTIVE = parseFestive(process.env.EXPO_PUBLIC_OFFICE_FESTIVE)

type Props = {
  /** ?season= from the URL. Invalid values are ignored in favour of the env override. */
  seasonOverride?: Season | null
  /** ?festive= from the URL. Invalid values are ignored in favour of the env override. */
  festiveOverride?: FestiveOverride | null
}

export function OfficeScreen({ seasonOverride, festiveOverride }: Props) {
  const { snapshot, connection, error, lastUpdate } = useOffice()
  const now = useTick(20)
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const compact = width < 720
  const selected = useMemo(
    () => snapshot?.characters.find((character) => character.id === selectedId) ?? null,
    [snapshot, selectedId],
  )

  const chromeTop = compact ? 92 : 100
  const chromeBottom = compact ? 178 : 138
  const horizontal = compact ? 10 : 20
  const availableWidth = Math.max(280, width - horizontal * 2)
  const availableHeight = Math.max(
    220,
    height - insets.top - insets.bottom - chromeTop - chromeBottom,
  )
  const sceneWidth = Math.min(availableWidth, availableHeight * SCENE_RATIO, 1160)
  const sceneHeight = sceneWidth / SCENE_RATIO

  const empty = snapshot != null && snapshot.characters.length === 0

  return (
    <View className="flex-1 bg-ink-950">
      <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
        <View
          className="absolute rounded-full bg-amber/10"
          style={{ width: 760, height: 420, top: -230, left: width / 2 - 380 }}
        />
        <View
          className="absolute rounded-full bg-teal/5"
          style={{ width: 520, height: 320, bottom: -180, right: -140 }}
        />
        <View
          className="absolute rounded-full"
          style={{
            width: 380,
            height: 380,
            bottom: -120,
            left: -120,
            backgroundColor: 'rgba(217,119,87,0.045)',
          }}
        />
      </View>

      <View
        className="flex-1"
        style={{ paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 6) }}
      >
        <View style={{ paddingHorizontal: horizontal }}>
          <TopBar snapshot={snapshot} connection={connection} now={now} error={error} />
        </View>

        <View className="flex-1 items-center justify-center">
          <View style={{ width: sceneWidth, height: sceneHeight }}>
            <OfficeScene
              snapshot={snapshot}
              now={now}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              seasonOverride={seasonOverride ?? ENV_SEASON}
              festiveOverride={festiveOverride ?? ENV_FESTIVE}
            />

            {empty ? (
              <View className="absolute inset-0 items-center justify-center">
                <View className="max-w-[300px] items-center rounded-card border border-white/10 bg-ink-900/90 px-5 py-4">
                  <Text className="font-display text-[17px] leading-[21px] text-cream">
                    The office is waiting
                  </Text>
                  <Text className="mt-1 text-center font-sans text-[11px] leading-[16px] text-cream-dim">
                    No models on the roster yet. Characters walk in when Pi starts working.
                  </Text>
                  <Text className="mt-2 font-sans text-[10px] text-cream-faint">
                    ☕ the kettle is on
                  </Text>
                </View>
              </View>
            ) : null}

            {!snapshot ? (
              <View className="absolute inset-0 items-center justify-center">
                <View className="rounded-pill border border-white/10 bg-ink-900/90 px-4 py-2.5">
                  <Text className="font-sans text-[11.5px] text-cream-dim">
                    {error ? 'Cannot reach the office — retrying…' : 'Opening the office…'}
                  </Text>
                </View>
              </View>
            ) : null}

            {snapshot && lastUpdate ? (
              <View
                pointerEvents="none"
                className="absolute bottom-1 left-0 right-0 items-center"
              >
                <Text className="font-sans text-[8.5px] text-cream-faint/70">
                  {connection === 'mock' ? 'fixture feed · cycles every few seconds' : 'read-only'}
                </Text>
              </View>
            ) : null}
          </View>

          {compact ? (
            <View style={{ width: sceneWidth, marginTop: 9 }}>
              <ActivityTicker snapshot={snapshot} />
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: horizontal }}>
          <RosterStrip
            characters={snapshot?.characters ?? []}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
        </View>
      </View>

      {selected ? (
        <CharacterCard character={selected} now={now} onClose={() => setSelectedId(null)} />
      ) : null}
    </View>
  )
}
