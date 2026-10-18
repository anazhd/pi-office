// Server-sent-events hub: bounded client count, backpressure eviction and change-only snapshots.
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OfficeSnapshot } from '../shared/office-types.ts'

export const MAX_SSE_CLIENTS = 64
export const MAX_SSE_BUFFERED_BYTES = 256 * 1024
export const SSE_DRAIN_TIMEOUT_MS = 10_000
export const SSE_HEARTBEAT_MS = 25_000

/** Hash everything except `now`, so an idle office does not resend an identical snapshot every tick. */
export function snapshotHash(snapshot: OfficeSnapshot): string {
  return createHash('sha1').update(JSON.stringify({ ...snapshot, now: 0 })).digest('hex')
}

export function sseFrame(snapshot: OfficeSnapshot): string {
  return `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`
}

type Client = {
  res: ServerResponse
  heartbeat: ReturnType<typeof setInterval> | null
  drainTimer: ReturnType<typeof setTimeout> | null
  closed: boolean
  cleanup: () => void
}

export type SseHubOptions = {
  maxClients?: number
  maxBufferedBytes?: number
  drainTimeoutMs?: number
  heartbeatMs?: number
}

export class SseHub {
  private readonly maxClients: number
  private readonly maxBufferedBytes: number
  private readonly drainTimeoutMs: number
  private readonly heartbeatMs: number
  private clients = new Set<Client>()
  private lastHash: string | null = null

  constructor(options: SseHubOptions = {}) {
    this.maxClients = options.maxClients ?? MAX_SSE_CLIENTS
    this.maxBufferedBytes = options.maxBufferedBytes ?? MAX_SSE_BUFFERED_BYTES
    this.drainTimeoutMs = options.drainTimeoutMs ?? SSE_DRAIN_TIMEOUT_MS
    this.heartbeatMs = options.heartbeatMs ?? SSE_HEARTBEAT_MS
  }

  get size(): number {
    return this.clients.size
  }

  /** Register a stream and send the current snapshot. Returns false when the hub is full (caller replies 503). */
  add(req: IncomingMessage, res: ServerResponse, snapshot: OfficeSnapshot): boolean {
    if (this.clients.size >= this.maxClients) return false

    const client: Client = {
      res,
      heartbeat: null,
      drainTimer: null,
      closed: false,
      cleanup: () => {},
    }

    const onDrain = () => {
      if (!client.drainTimer) return
      clearTimeout(client.drainTimer)
      client.drainTimer = null
    }

    const cleanup = () => {
      if (client.closed) return
      client.closed = true
      if (client.heartbeat) clearInterval(client.heartbeat)
      if (client.drainTimer) clearTimeout(client.drainTimer)
      client.heartbeat = null
      client.drainTimer = null
      this.clients.delete(client)
      req.off('close', cleanup)
      req.off('error', cleanup)
      res.off('close', cleanup)
      res.off('error', cleanup)
      res.off('drain', onDrain)
      try {
        res.end()
      } catch {
        /* already gone */
      }
    }
    client.cleanup = cleanup

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    })
    res.write('retry: 3000\n\n')

    this.clients.add(client)
    req.on('close', cleanup)
    req.on('error', cleanup)
    res.on('close', cleanup)
    res.on('error', cleanup)
    res.on('drain', onDrain)

    client.heartbeat = setInterval(() => this.send(client, ': ping\n\n'), this.heartbeatMs)
    client.heartbeat.unref()
    this.send(client, sseFrame(snapshot))
    return true
  }

  /** Mark the current snapshot as already delivered (used once at boot before the first push tick). */
  prime(snapshot: OfficeSnapshot): void {
    this.lastHash = snapshotHash(snapshot)
  }

  /** Send to every client only when the snapshot (ignoring `now`) actually changed. */
  broadcast(snapshot: OfficeSnapshot): void {
    const hash = snapshotHash(snapshot)
    if (hash === this.lastHash) return
    this.lastHash = hash
    const frame = sseFrame(snapshot)
    for (const client of [...this.clients]) this.send(client, frame)
  }

  closeAll(): void {
    for (const client of [...this.clients]) client.cleanup()
  }

  private send(client: Client, chunk: string): boolean {
    if (client.closed) return false
    let ok: boolean
    try {
      ok = client.res.write(chunk)
    } catch {
      client.cleanup()
      return false
    }
    if (client.closed) return false
    if (client.res.writableLength > this.maxBufferedBytes) {
      client.cleanup()
      return false
    }
    if (!ok && !client.drainTimer) {
      client.drainTimer = setTimeout(() => client.cleanup(), this.drainTimeoutMs)
      client.drainTimer.unref()
    }
    return ok
  }
}
