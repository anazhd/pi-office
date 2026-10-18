import { Text, View } from 'react-native'
import type { OfficeSnapshot } from '@/api/types'
import { compactNumber } from './format'

export function ActivityTicker({ snapshot }: { snapshot: OfficeSnapshot | null }) {
  if (!snapshot) {
    return (
      <View className="flex-row items-center justify-between rounded-card border border-white/10 bg-ink-900/60 px-3 py-2">
        <Text className="font-sans text-[10px] text-cream-faint">Opening the office…</Text>
      </View>
    )
  }

  const active = snapshot.characters.flatMap((character) => character.active)
  const projects = [...new Set(active.map((session) => session.project))]
  const summary =
    active.length === 0
      ? 'Everyone is in the lounge — the kettle just clicked off.'
      : `${projects.slice(0, 3).join(' · ')}${projects.length > 3 ? ` +${projects.length - 3}` : ''}`

  return (
    <View className="flex-row items-center justify-between rounded-card border border-white/10 bg-ink-900/60 px-3 py-2">
      <View className="flex-1 flex-row items-center gap-2">
        <View
          className="h-[6px] w-[6px] rounded-full"
          style={{ backgroundColor: active.length ? '#63B9A8' : '#8F8474' }}
        />
        <Text numberOfLines={1} className="flex-1 font-sans text-[9.5px] text-cream-dim">
          {summary}
        </Text>
      </View>
      <Text className="ml-2 font-mono text-[9px] text-amber/80">
        {compactNumber(snapshot.totals.todayOutputTokens)} today
      </Text>
    </View>
  )
}
