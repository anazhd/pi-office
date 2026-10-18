import { Text, useWindowDimensions, View } from 'react-native'
import type { OfficeSnapshot } from '@/api/types'
import type { OfficeConnection } from '@/hooks/use-office'
import { clockLabel, compactNumber } from './format'

type Props = {
  snapshot: OfficeSnapshot | null
  connection: OfficeConnection
  now: number
  error: string | null
}

const CONNECTION_COLOR: Record<OfficeConnection, string> = {
  live: '#63B9A8',
  connecting: '#E9A94C',
  polling: '#E9A94C',
  mock: '#D97757',
  offline: '#C96A55',
}

const CONNECTION_LABEL: Record<OfficeConnection, string> = {
  live: 'live',
  connecting: 'connecting',
  polling: 'polling',
  mock: 'mock fixture',
  offline: 'offline',
}

export function TopBar({ snapshot, connection, now, error }: Props) {
  const { width } = useWindowDimensions()
  const compact = width < 720
  const working = snapshot?.totals.workingCharacters ?? 0
  const activeSessions = snapshot?.totals.activeSessions ?? 0
  const color = CONNECTION_COLOR[connection]
  const pulse = 0.5 + 0.5 * Math.sin(now / 520)

  const status = !snapshot
    ? error
      ? 'Office unreachable — retrying'
      : 'Opening the office…'
    : working === 0
      ? 'All quiet — coffee break ☕'
      : `${working} at work`

  return (
    <View
      className="flex-row items-center justify-between rounded-card border border-white/10 bg-ink-900/85 px-3 py-2 md:px-4 md:py-2.5"
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.38,
        shadowRadius: 26,
        shadowOffset: { width: 0, height: 14 },
        elevation: 12,
      }}
    >
      <View className="flex-1 flex-row items-center gap-2.5 md:gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-[11px] bg-amber md:h-10 md:w-10">
          <Text className="font-display text-[20px] leading-[24px] text-ink-950 md:text-[22px]">
            π
          </Text>
        </View>
        <View className="flex-1">
          <Text className="font-display text-[17px] leading-[21px] tracking-tight text-cream md:text-[20px]">
            Pi Office
          </Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <View className="h-[7px] w-[7px] items-center justify-center">
              <View
                className="absolute h-[13px] w-[13px] rounded-full"
                style={{ backgroundColor: color, opacity: connection === 'live' ? 0.14 + pulse * 0.16 : 0.1 }}
              />
              <View className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: color, opacity: connection === 'live' ? 0.75 + pulse * 0.25 : 0.85 }} />
            </View>
            <Text numberOfLines={1} className="font-sans text-[10.5px] leading-[14px] text-cream-dim md:text-[11.5px]">
              {status}
            </Text>
            {connection !== 'live' ? (
              <Text className="font-sans text-[9px] text-cream-faint">· {CONNECTION_LABEL[connection]}</Text>
            ) : null}
          </View>
        </View>
      </View>

      <View className="ml-2 flex-row items-center gap-2.5 md:gap-5">
        {!compact ? (
          <>
            <MiniStat label="sessions" value={`${activeSessions}`} accent={activeSessions > 0} />
            <View className="h-7 w-px bg-white/10" />
            <MiniStat
              label="tokens today"
              value={compactNumber(snapshot?.totals.todayOutputTokens ?? 0)}
            />
            <View className="h-7 w-px bg-white/10" />
          </>
        ) : null}
        <View className="items-end">
          <Text className="font-mono text-[11px] leading-[14px] text-cream-dim md:text-[12.5px]">
            {clockLabel(now)}
          </Text>
          <Text className="font-sans text-[8.5px] text-cream-faint">local time</Text>
        </View>
      </View>
    </View>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View className="items-end">
      <Text
        className={`font-mono text-[12px] leading-[15px] md:text-[13px] ${
          accent ? 'text-amber' : 'text-cream'
        }`}
      >
        {value}
      </Text>
      <Text className="font-sans text-[8.5px] text-cream-faint md:text-[9px]">{label}</Text>
    </View>
  )
}
