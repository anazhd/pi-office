import { useEffect, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'

/**
 * A single shared clock for the scene. Capped at 20fps by default and paused
 * whenever the tab/app is not visible, so idle offices cost almost nothing.
 */
export function useTick(fps = 20): number {
  const [now, setNow] = useState(() => Date.now())
  const fpsRef = useRef(fps)
  fpsRef.current = fps

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let visible = true

    const start = () => {
      if (timer) return
      timer = setInterval(() => setNow(Date.now()), Math.max(50, Math.round(1000 / fpsRef.current)))
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }
    const sync = () => {
      if (visible) {
        setNow(Date.now())
        start()
      } else {
        stop()
      }
    }

    if (Platform.OS === 'web') {
      const doc = typeof document !== 'undefined' ? document : null
      visible = !doc?.hidden
      const onVisibility = () => {
        visible = !document.hidden
        sync()
      }
      doc?.addEventListener('visibilitychange', onVisibility)
      sync()
      return () => {
        doc?.removeEventListener('visibilitychange', onVisibility)
        stop()
      }
    }

    visible = AppState.currentState === 'active'
    const sub = AppState.addEventListener('change', (state) => {
      visible = state === 'active'
      sync()
    })
    sync()
    return () => {
      sub.remove()
      stop()
    }
  }, [])

  return now
}
