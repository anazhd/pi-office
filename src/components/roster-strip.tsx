import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import type { Character } from '@/api/types'
import { providerColor, providerLabel } from '@/scene/palette'
import { toolGlyph } from '@/scene/speech-bubble'
import { compactNumber, contrastText } from './format'

type Props = {
  characters: Character[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function RosterStrip({ characters, selectedId, onSelect }: Props) {
  const { width } = useWindowDimensions()
  const compact = width < 720
  const activeCount = characters.filter((c) => c.status !== 'idle').length
  const sessions = characters.reduce((n, c) => n + c.active.length, 0)

  return (
    <View
      className="rounded-card border border-white/10 bg-ink-900/80 p-2"
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8,
      }}
    >
      <View className="flex-row items-end justify-between px-1 pb-1.5">
        <View>
          <Text className="font-display text-[15px] leading-[19px] text-cream md:text-[16px]">
            On the floor
          </Text>
          <Text className="font-sans text-[9.5px] text-cream-faint">
            tap a character for their file
          </Text>
        </View>
        <View className="items-end">
          <Text className="font-sans text-[9.5px] text-cream-faint md:text-[10px]">
            {characters.length} models · {sessions} {sessions === 1 ? 'session' : 'sessions'}
            {activeCount > 0 ? ` · ${activeCount} at work` : ''}
          </Text>
          {width >= 1000 ? <ProviderLegend characters={characters} /> : null}
        </View>
      </View>

      {characters.length === 0 ? (
        <View className="items-center justify-center rounded-[13px] border border-dashed border-white/10 px-4 py-4">
          <Text className="font-sans text-[11px] text-cream-faint">
            The roster is empty. The lounge is very quiet.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="no-scrollbar"
          contentContainerStyle={{ gap: 7, paddingHorizontal: 1, paddingBottom: 1 }}
        >
          {characters.map((character) => (
            <RosterCard
              key={character.id}
              character={character}
              compact={compact}
              selected={selectedId === character.id}
              onSelect={onSelect}
            />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

function ProviderLegend({ characters }: { characters: Character[] }) {
  const seen = new Map<string, string>()
  for (const character of characters) {
    const key = character.provider
    if (!seen.has(key)) seen.set(key, providerColor(key, character.model))
  }
  const entries = [...seen.entries()].slice(0, 6)
  return (
    <View className="mt-1 flex-row items-center gap-2.5">
      {entries.map(([provider, color]) => (
        <View key={provider} className="flex-row items-center gap-1">
          <View className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: color }} />
          <Text className="font-sans text-[8px] text-cream-faint">
            {providerLabel(provider).replace('OpenAI Codex', 'Codex')}
          </Text>
        </View>
      ))}
    </View>
  )
}

function RosterCard({
  character,
  compact,
  selected,
  onSelect,
}: {
  character: Character
  compact: boolean
  selected: boolean
  onSelect: (id: string) => void
}) {
  const shirt = providerColor(character.provider, character.model)
  const active = character.status !== 'idle'
  const first = character.active[0]
  const detail = first
    ? character.status === 'tool'
      ? `${toolGlyph(first.tool ?? 'tool').icon} ${toolGlyph(first.tool ?? 'tool').label}`
      : 'thinking…'
    : 'coffee break'

  return (
    <Pressable
      onPress={() => onSelect(character.id)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${character.displayName} card`}
      className={`rounded-[14px] border px-2.5 py-2 ${
        selected
          ? 'border-amber/60 bg-ink-700'
          : active
            ? 'border-white/15 bg-ink-800/90'
            : 'border-white/10 bg-ink-800/55'
      }`}
      style={({ pressed }) => ({
        width: compact ? 158 : 186,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <View className="flex-row items-center gap-2">
        <View
          className="h-[30px] w-[30px] items-center justify-center rounded-full"
          style={{
            backgroundColor: shirt,
            borderWidth: active ? 2 : 1,
            borderColor: active ? '#F4EDE0' : 'rgba(255,255,255,0.16)',
          }}
        >
          <Text
            className="font-display text-[14px]"
            style={{ color: contrastText(shirt) }}
          >
            {character.displayName.slice(0, 1)}
          </Text>
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className="font-bodyMedium text-[12px] leading-[15px] text-cream">
            {character.displayName}
          </Text>
          <Text numberOfLines={1} className="font-sans text-[9px] leading-[12px] text-cream-faint">
            {character.title} · L{character.level}
          </Text>
        </View>
        {active ? (
          <View className="h-[6px] w-[6px] rounded-full bg-teal" />
        ) : null}
      </View>

      <View className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/10">
        <View
          className="h-full rounded-full"
          style={{
            width: `${Math.max(3, Math.round(character.levelProgress * 100))}%`,
            backgroundColor: shirt,
          }}
        />
      </View>

      <View className="mt-1 flex-row items-center justify-between">
        <Text numberOfLines={1} className="mr-1 flex-1 font-sans text-[8.5px] text-cream-faint">
          {detail}
        </Text>
        <Text className="font-mono text-[8.5px] text-amber/80">
          {compactNumber(character.stats.todayOutputTokens)} tok
        </Text>
      </View>
    </Pressable>
  )
}
