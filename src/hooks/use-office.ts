import { useEffect, useRef, useState } from 'react'
import { apiUrl, fetchOffice, parseSnapshot, USE_MOCK } from '@/api/client'
import type { OfficeSnapshot } from '@/api/types'

export type OfficeConnection = 'connecting' | 'live' | 'polling' | 'mock' | 'offline'

export type OfficeState = {
  snapshot: OfficeSnapshot | null
  connection: OfficeConnection
  error: string | null
  lastUpdate: number | null
}

const POLL_MS = 3000
const FALLBACK_POLL_MS = 5000
const MAX_BACKOFF_MS = 15_000

export function useOffice(): OfficeState {
  const [snapshot, setSnapshot] = useState<OfficeSnapshot | null>(null)
  const [connection, setConnection] = useState<OfficeConnection>(
    USE_MOCK ? 'mock' : 'connecting',
  )
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number | null>(null)
  const hasData = useRef(false)

  useEffect(() => {
    let cancelled = false
    let source: EventSource | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let backoff = 1000

    const apply = (next: OfficeSnapshot) => {
      if (cancelled) return
      hasData.current = true
      setSnapshot(next)
      setLastUpdate(Date.now())
      setError(null)
    }

    const fail = (res: unknown) => {
      if (cancelled) return
      setError(res instanceof Error ? res.message : 'Office is unreachable')
      if (!hasData.current) setConnection('offline')
    }

    const load = async () => {
      try {
        apply(await fetchOffice())
      } catch (res) {
        fail(res)
      }
    }

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
    }

    const startPolling = (interval = POLL_MS) => {
      if (pollTimer || cancelled) return
      if (!hasData.current && connection !== 'offline') setConnection('polling')
      void load()
      pollTimer = setInterval(() => void load(), interval)
    }

    if (USE_MOCK) {
      setConnection('mock')
      void load()
      pollTimer = setInterval(() => void load(), 4200)
      return () => {
        cancelled = true
        stopPolling()
      }
    }

    // Seed immediately so the room is never empty while SSE negotiates.
    void load()

    if (typeof EventSource === 'undefined') {
      setConnection('polling')
      startPolling(POLL_MS)
      return () => {
        cancelled = true
        stopPolling()
      }
    }

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, backoff)
      backoff = Math.min(Math.round(backoff * 1.7), MAX_BACKOFF_MS)
    }

    const connect = () => {
      if (cancelled) return
      try {
        source = new EventSource(apiUrl('/api/stream'))
      } catch (res) {
        fail(res)
        startPolling(FALLBACK_POLL_MS)
        scheduleReconnect()
        return
      }

      source.addEventListener('snapshot', (event) => {
        const next = parseSnapshot((event as MessageEvent<string>).data)
        if (!next) return
        backoff = 1000
        stopPolling()
        setConnection('live')
        apply(next)
      })

      source.addEventListener('open', () => {
        if (cancelled) return
        backoff = 1000
        stopPolling()
        setConnection('live')
      })

      source.addEventListener('error', () => {
        source?.close()
        source = null
        if (cancelled) return
        setConnection(hasData.current ? 'connecting' : 'offline')
        startPolling(FALLBACK_POLL_MS)
        scheduleReconnect()
      })
    }

    connect()

    return () => {
      cancelled = true
      source?.close()
      source = null
      if (reconnectTimer) clearTimeout(reconnectTimer)
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { snapshot, connection, error, lastUpdate }
}
