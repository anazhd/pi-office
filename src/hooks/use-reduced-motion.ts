import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * The OS "reduce motion" setting, live. On web react-native-web answers it from
 * prefers-reduced-motion; on native from the accessibility setting.
 *
 * The office keeps its light and colours but freezes the weather outside the windows, so a
 * reduced-motion viewer still sees which season it is without anything moving.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let alive = true
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) =>
      setReduced(value),
    )
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduced(value)
      })
      .catch(() => {})
    return () => {
      alive = false
      subscription?.remove()
    }
  }, [])

  return reduced
}
