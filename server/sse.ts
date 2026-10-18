// Server-sent-events hub: bounded client count, backpressure eviction and change-only snapshots.
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OfficeSnapshot } from '../shared/office-types.ts'

export const MAX_SSE_CLIENTS = 64
export const MAX_SSE_BUFFERED_BYTES = 256 * 1024
export const SSE_DRAIN_TIMEOUT_MS = 10_000
export const SSE_HEARTBEAT_MS = 25_000

/** Response headers shared by GET (streaming) and HEAD (headers only) on /api/stream. */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
  'Access-Control-Allow-Origin': '*',
} as const

/** Hash everything except `now`, so an idle office does not resend an identical snapshot every tick. */
export function snapshotHash(snapshot: OfficeSnapshot): string {
  return createHash('sha1').update(JSON.stringify({ ...snapshot, now: 0 })).digest('hex')
}

export function sseFrame(snapshot: OfficeSnapshot): string {
  return `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`
}

type Client = {
  req: IncomingMessage
  res: ServerResponse
  heartbeat: ReturnType<typeof setInterval> | null
  drainTimer: ReturnType<typeof setTimeout> | null
  closed: boolean
  /** Detach the close/drain listeners (error listeners stay; see add()). */
  detach: () => void
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
      req,
      res,
      heartbeat: null,
      drainTimer: null,
      closed: false,
      detach: () => {},
    }
    const onGone = () => this.release(client, true)
    const onDrain = () => {
      if (!client.drainTimer) return
      clearTimeout(client.drainTimer)
      client.drainTimer = null
    }

    // Error listeners stay attached for the response's whole life: a destroyed socket can still emit
    // a late 'error' (e.g. write-after-destroy), and an unhandled one would crash the process.
    req.on('error', onGone)
    res.on('error', onGone)
    req.on('close', onGone)
    res.on('close', onGone)
    res.on('drain', onDrain)
    client.detach = () => {
      req.off('close', onGone)
      res.off('close', onGone)
      res.off('drain', onDrain)
    }

    res.writeHead(200, SSE_HEADERS)
    res.write('retry: 3000\n\n')

    this.clients.add(client)
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

  /** Shutdown: drop every stream and its socket. */
  closeAll(): void {
    for (const client of [...this.clients]) this.release(client, true)
  }

  /**
   * Single exit path for every client (peer close, error, eviction, shutdown). Idempotent.
   * `destroy` tears down the socket immediately: `res.end()` would wait for queued bytes to flush,
   * which a non-reading peer never does, so the socket and its buffer would live on after eviction.
   */
  private release(client: Client, destroy: boolean): void {
    if (client.closed) return
    client.closed = true
    if (client.heartbeat) clearInterval(client.heartbeat)
    if (client.drainTimer) clearTimeout(client.drainTimer)
    client.heartbeat = null
    client.drainTimer = null
    this.clients.delete(client)
    client.detach()
    if (destroy && !client.res.destroyed) {
      try {
        client.res.destroy()
      } catch {
        /* already gone */
      }
    }
  }

  private send(client: Client, chunk: string): boolean {
    if (client.closed) return false
    let ok: boolean
    try {
      ok = client.res.write(chunk)
    } catch {
      this.release(client, true)
      return false
    }
    if (client.closed) return false
    if (client.res.writableLength > this.maxBufferedBytes) {
      this.release(client, true)
      return false
    }
    if (!ok && !client.drainTimer) {
      client.drainTimer = setTimeout(() => this.release(client, true), this.drainTimeoutMs)
      client.drainTimer.unref()
    }
    return ok
  }
}
