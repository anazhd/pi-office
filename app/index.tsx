import { useLocalSearchParams } from 'expo-router'
import { OfficeScreen } from '@/components/office-screen'
import { parseFestive } from '@/scene/festive'
import { parseSeason } from '@/scene/season'

export default function Home() {
  // ?season=winter|spring|summer|autumn previews a season without waiting for the calendar;
  // ?festive=halloween|none|auto does the same for the dated overlay, and never changes the season.
  const { season, festive } = useLocalSearchParams<{ season?: string; festive?: string }>()
  return <OfficeScreen seasonOverride={parseSeason(season)} festiveOverride={parseFestive(festive)} />
}
