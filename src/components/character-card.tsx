import { useEffect } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Circle, G, Path, Rect, Svg } from 'react-native-svg'
import type { Character } from '@/api/types'
import { lookFor, providerColor, providerLabel } from '@/scene/palette'
import { toolGlyph } from '@/scene/speech-bubble'
import {
  compactNumber,
  contrastText,
  dayLabel,
  fullNumber,
  relativeTime,
  sessionAge,
} from './format'

type Props = {
  character: Character
  now: number
  onClose: () => void
}

export function CharacterCard({ character, now, onClose }: Props) {
  const { width, height } = useWindowDimensions()
  const shirt = providerColor(character.provider, character.model)
  const look = lookFor(character)
  const panelWidth = Math.min(width - 28, 458)
  const active = character.active[0]
  const activity = active
    ? character.status === 'tool'
      ? `${toolGlyph(active.tool ?? 'tool').icon} ${toolGlyph(active.tool ?? 'tool').label} · ${active.project}`
      : `thinking · ${active.project}`
    : 'In the lounge · coffee break'

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <View className="absolute inset-0 z-50 items-center justify-center px-3">
      <Pressable
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(7,5,4,0.7)' }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close character card"
      />
      <View
        className="overflow-hidden rounded-[22px] border border-white/15 bg-ink-900"
        style={{
          width: panelWidth,
          maxHeight: height * 0.9,
          shadowColor: '#000',
          shadowOpacity: 0.6,
          shadowRadius: 40,
          shadowOffset: { width: 0, height: 24 },
          elevation: 24,
        }}
      >
        <View style={{ height: 4, backgroundColor: shirt }} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 18 }}
        >
          <View className="flex-row items-start gap-3">
            <View
              className="h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-[16px]"
              style={{ backgroundColor: shirt }}
            >
              <CharacterBust look={look} />
            </View>
            <View className="flex-1">
              <Text
                numberOfLines={1}
                className="font-display text-[21px] leading-[25px] tracking-tight text-cream"
              >
                {character.displayName}
              </Text>
              <Text className="mt-0.5 font-sans text-[10.5px] text-cream-faint">
                {providerLabel(character.provider)} · {character.model}
              </Text>
              <View className="mt-2 flex-row">
                <View className="flex-row items-center gap-1.5 rounded-pill border border-white/10 bg-ink-800 px-2 py-[3px]">
                  <View
                    className="h-[6px] w-[6px] rounded-full"
                    style={{ backgroundColor: active ? shirt : '#8F8474' }}
                  />
                  <Text className="font-sans text-[9.5px] text-cream-dim">{activity}</Text>
                </View>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-ink-800"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="font-sans text-[17px] leading-[19px] text-cream-dim">×</Text>
            </Pressable>
          </View>

          <View className="mt-4 rounded-[14px] border border-white/10 bg-ink-800/60 px-3 py-2.5">
            <View className="flex-row items-end justify-between">
              <View className="flex-row items-baseline gap-2">
                <Text className="font-display text-[20px] leading-[24px] text-cream">
                  Level {character.level}
                </Text>
                <Text className="font-bodyMedium text-[10.5px] text-cream-dim">{character.title}</Text>
              </View>
              <Text className="font-mono text-[10px] text-amber">
                {compactNumber(character.xp)} XP
              </Text>
            </View>
            <View className="mt-2 h-[6px] overflow-hidden rounded-full bg-white/10">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(3, Math.round(character.levelProgress * 100))}%`,
                  backgroundColor: shirt,
                }}
              />
            </View>
            <Text className="mt-1.5 font-sans text-[9px] text-cream-faint">
              {Math.round(character.levelProgress * 100)}% of the way to level {character.level + 1}
            </Text>
          </View>

          <View className="mt-3 flex-row flex-wrap" style={{ gap: 7 }}>
            <Stat label="messages" value={fullNumber(character.stats.messages)} />
            <Stat label="output tokens" value={fullNumber(character.stats.outputTokens)} />
            <Stat label="input tokens" value={fullNumber(character.stats.inputTokens)} />
            <Stat label="tool calls" value={fullNumber(character.stats.toolCalls)} />
            <Stat label="sessions" value={fullNumber(character.stats.sessions)} />
            <Stat
              label="today"
              value={`${compactNumber(character.stats.todayOutputTokens)} tok`}
              accent
            />
          </View>

          <View className="mt-3 flex-row justify-between rounded-[14px] border border-white/10 bg-ink-800/40 px-3 py-2">
            <Timeline label="first seen" value={dayLabel(character.stats.firstSeen, now)} />
            <View className="w-px bg-white/10" />
            <Timeline label="last seen" value={relativeTime(character.stats.lastSeen, now)} />
            <View className="w-px bg-white/10" />
            <Timeline
              label="live sessions"
              value={character.active.length ? `${character.active.length}` : 'none'}
            />
          </View>

          {character.active.length > 0 ? (
            <View className="mt-3">
              <Text className="font-bodyMedium text-[10px] tracking-wide text-cream-faint">
                right now
              </Text>
              {character.active.slice(0, 3).map((session) => (
                <View
                  key={session.key}
                  className="mt-1.5 flex-row items-center justify-between rounded-[11px] border border-white/10 bg-ink-800/50 px-2.5 py-2"
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="font-sans text-[10px] text-cream-dim">
                      {session.status === 'tool'
                        ? toolGlyph(session.tool ?? 'tool').icon
                        : '…'}
                    </Text>
                    <Text numberOfLines={1} className="font-bodyMedium text-[10.5px] text-cream">
                      {session.project}
                    </Text>
                    <Text className="font-sans text-[9.5px] text-cream-faint">
                      {session.status === 'tool'
                        ? toolGlyph(session.tool ?? 'tool').label
                        : 'thinking'}
                    </Text>
                  </View>
                  <Text className="font-mono text-[9px] text-cream-faint">
                    {sessionAge(session.since, now)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text className="mt-4 text-center font-sans text-[9px] leading-[13px] text-cream-faint">
            Read-only window into Pi. Nothing on this card can change a session.
          </Text>
        </ScrollView>
      </View>
    </View>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View
      className="rounded-[11px] border border-white/10 bg-ink-800/55 px-2.5 py-2"
      style={{ width: '48.6%' }}
    >
      <Text className="font-mono text-[13px] leading-[17px] text-cream">{value}</Text>
      <Text className={`font-sans text-[9px] ${accent ? 'text-amber/80' : 'text-cream-faint'}`}>
        {label}
      </Text>
    </View>
  )
}

function Timeline({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="font-mono text-[10.5px] text-cream-dim">{value}</Text>
      <Text className="font-sans text-[8.5px] text-cream-faint">{label}</Text>
    </View>
  )
}

function CharacterBust({ look }: { look: ReturnType<typeof lookFor> }) {
  return (
    <Svg width={58} height={58} viewBox="0 0 64 64">
      <Circle cx={32} cy={32} r={32} fill={look.shirt} />
      <Circle cx={32} cy={30} r={16.5} fill={look.skin} />
      <G>
        <Path
          d="M 15 30 Q 15 12 32 12 Q 49 12 49 30 Q 43 23 32 23 Q 21 23 15 30 Z"
          fill={look.hair}
        />
        {look.hairStyle === 2 ? <Circle cx={32} cy={11} r={6} fill={look.hair} /> : null}
        {look.hairStyle === 3 ? (
          <G fill={look.hair}>
            <Circle cx={21} cy={21} r={6} />
            <Circle cx={32} cy={17} r={7} />
            <Circle cx={43} cy={21} r={6} />
          </G>
        ) : null}
        {look.hairStyle === 4 ? (
          <Path d="M 15 30 L 14 47 Q 20 44 21 33 L 43 33 Q 44 44 50 47 L 49 30 Z" fill={look.hair} />
        ) : null}
      </G>
      <Circle cx={26} cy={31} r={1.4} fill="#2A201A" />
      <Circle cx={38} cy={31} r={1.4} fill="#2A201A" />
      <Path d="M 29 36 Q 32 38 35 36" stroke="#7A4A36" strokeWidth={1.1} fill="none" strokeLinecap="round" />
      <Path d="M 22 47 Q 32 42 42 47 L 42 64 L 22 64 Z" fill={look.shirtDark} />
      <Rect x={28} y={43} width={8} height={6} rx={2.5} fill={look.skin} />
      <Path d="M 25 52 L 32 48 L 39 52" stroke="#F4EDE0" strokeWidth={1.2} fill="none" opacity={0.7} />
    </Svg>
  )
}
