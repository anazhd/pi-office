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
const FETCH_TIMEOUT_MS = 8000

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
    let sseLive = false
    // One request at a time: a tick is skipped while a fetch is in flight, and the controller lets us
    // abort a slow response before it can overwrite something newer (SSE snapshot, newer poll).
    let inflight: { controller: AbortController; cancelled: boolean } | null = null
    // Server time of the newest snapshot we have applied; older snapshots arriving late are dropped.
    let appliedNow = Number.NEGATIVE_INFINITY

    const abortInflight = () => {
      if (!inflight) return
      inflight.cancelled = true
      inflight.controller.abort()
      inflight = null
    }

    /** Returns true when the snapshot was actually applied (not stale). */
    const apply = (next: OfficeSnapshot) => {
      if (cancelled) return false
      if (next.now < appliedNow) return false
      appliedNow = next.now
      hasData.current = true
      setSnapshot(next)
      setLastUpdate(Date.now())
      setError(null)
      return true
    }

    const fail = (res: unknown) => {
      if (cancelled) return
      setError(res instanceof Error ? res.message : 'Office is unreachable')
      if (!USE_MOCK && !sseLive) setConnection('offline')
    }

    const load = async () => {
      if (cancelled || inflight) return
      const request = { controller: new AbortController(), cancelled: false }
      inflight = request
      const timer = setTimeout(() => request.controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const next = await fetchOffice(request.controller.signal)
        if (cancelled || request.cancelled) return
        // A failed poll means the office is unreachable even if we have older data on screen.
        if (apply(next)) {
          if (!USE_MOCK && !sseLive) setConnection('polling')
        }
      } catch (res) {
        if (cancelled || request.cancelled) return
        fail(res)
      } finally {
        clearTimeout(timer)
        if (inflight === request) inflight = null
      }
    }

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
    }

    const startPolling = (interval = POLL_MS) => {
      if (pollTimer || cancelled) return
      void load()
      pollTimer = setInterval(() => void load(), interval)
    }

    if (USE_MOCK) {
      setConnection('mock')
      void load()
      pollTimer = setInterval(() => void load(), 4200)
      return () => {
        cancelled = true
        abortInflight()
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
        abortInflight()
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
      // Drop any poll still in flight so it cannot land after the stream's first snapshot.
      abortInflight()
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
        sseLive = true
        abortInflight()
        stopPolling()
        setConnection('live')
        apply(next)
      })

      source.addEventListener('open', () => {
        if (cancelled) return
        backoff = 1000
        sseLive = true
        abortInflight()
        stopPolling()
        setConnection('live')
      })

      source.addEventListener('error', () => {
        source?.close()
        source = null
        if (cancelled) return
        sseLive = false
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
      abortInflight()
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { snapshot, connection, error, lastUpdate }
}
