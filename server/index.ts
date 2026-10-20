// Pi Office server: serves the exported Expo web app (dist/) plus the read-only office API.
//
//   GET /api/office  -> OfficeSnapshot JSON
//   GET /api/stream  -> SSE snapshots (+ 25s heartbeat)
//   GET /api/health  -> { ok: true }
//   everything else  -> static dist/ with SPA fallback
//
// Zero dependencies. Binds 127.0.0.1:6702 by default. Every request passes the Host allowlist (DNS rebinding),
// API requests pass the Origin policy, and streams are capped globally and per client. Configuration and the
// public-exposure opt-ins live in server/config.ts and SECURITY.md.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, realpathSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import type { OfficeSnapshot } from '../shared/office-types.ts'
import { checkHost, checkOrigin, clientBucket, ConfigError, loadConfig, type ServerConfig } from './config.ts'
import { DeskAllocator, deskStateFile } from './desks.ts'
import { isInside, piSessionsLocation } from './paths.ts'
import { OfficeStore } from './sessions.ts'
import { SSE_HEADERS, SseHub } from './sse.ts'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DIST = join(ROOT, 'dist')
const PUSH_MS = 1_000
/** GET /api/office and new streams reuse a snapshot this fresh instead of rebuilding one per request. */
export const SNAPSHOT_CACHE_MS = 250
/** Coalesced desk-state writes: off the request path, at most one per this interval. */
const DESK_WRITE_DELAY_MS = 500

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
}

const NOT_BUILT_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pi Office — not built yet</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#14110f; color:#f4efe9;
         font:16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif }
  main { max-width:34rem; padding:2rem; text-align:center }
  h1 { font-size:1.5rem; margin:0 0 .75rem }
  code { background:#241f1b; border-radius:.35rem; padding:.15rem .4rem; font-size:.95em }
  p { color:#c9bfb5 }
</style></head>
<body><main>
  <h1>The Pi Office web app isn't built yet</h1>
  <p>Run <code>npm run build</code> to export the Expo web bundle into <code>dist/</code>, then reload.</p>
  <p>The API is already live: <code>/api/office</code>, <code>/api/stream</code>, <code>/api/health</code>.</p>
</main></body></html>
`

// ---------------------------------------------------------------- headers

/**
 * Sent on every response. The CSP fits the static Expo export (external scripts only; react-native-web injects
 * styles at runtime, hence style-src 'unsafe-inline'); the API is same-origin unless CORS is configured.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; " +
    "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
}

function plain(req: IncomingMessage, res: ServerResponse, status: number, body: string, extra: Record<string, string> = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
    ...extra,
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

// ---------------------------------------------------------------- static files

export function cacheControl(pathname: string): string {
  if (pathname.startsWith('/_expo/static/')) return 'public, max-age=31536000, immutable'
  return 'no-cache'
}

/** Resolve a URL path to a file inside dist/, or null when it escapes or is malformed. Lexical only. */
export function safePath(pathname: string, dist: string = DIST): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  // Backslashes are path separators on Windows: treat them as such everywhere so the check is identical.
  const normalized = decoded.replaceAll('\\', '/')
  const full = resolve(dist, '.' + (normalized.startsWith('/') ? normalized : '/' + normalized))
  return isInside(dist, full) ? full : null
}

/**
 * The file's real path when it is still inside dist/ after following symlinks, else null. A symlink placed in
 * dist/ (or a dist/ that is itself a symlink) can never serve a file from outside the real dist directory.
 */
export async function containedRealPath(file: string, dist: string = DIST): Promise<string | null> {
  try {
    const [root, real] = await Promise.all([realpath(dist), realpath(file)])
    return isInside(root, real) ? real : null
  } catch {
    return null
  }
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string, dist: string): Promise<void> {
  if (!(await statOrNull(dist))) {
    const body = NOT_BUILT_HTML
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES['.html'],
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
    return
  }

  const target = pathname === '/' ? join(dist, 'index.html') : safePath(pathname, dist)
  if (!target) return plain(req, res, 400, 'Bad request\n')

  let file: string | null = target
  let info = await statOrNull(file)
  if (info?.isDirectory()) {
    file = join(file, 'index.html')
    info = await statOrNull(file)
  }
  if (info?.isFile()) {
    file = await containedRealPath(file, dist)
    if (!file) return plain(req, res, 404, 'Not found\n')
  } else {
    // SPA fallback: extension-less paths render the app shell; missing assets stay 404.
    if (extname(pathname) !== '') return plain(req, res, 404, 'Not found\n')
    file = await containedRealPath(join(dist, 'index.html'), dist)
    info = file ? await statOrNull(file) : null
    if (!file || !info?.isFile()) return plain(req, res, 404, 'Not found\n')
  }

  await sendFile(req, res, file, info, pathname)
}

/** HEAD answers from stat; GET streams the file and destroys the stream if the client goes away. */
export async function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  info: { size: number },
  pathname: string,
): Promise<void> {
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': cacheControl(pathname),
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(file)
  const onClose = () => {
    if (!res.writableEnded) stream.destroy()
  }
  res.on('close', onClose)
  try {
    await pipeline(stream, res)
  } finally {
    res.off('close', onClose)
  }
}

async function statOrNull(path: string) {
  try {
    return await stat(path)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- API

function sendJson(req: IncomingMessage, res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

export type AppDeps = {
  config: ServerConfig
  hub: SseHub
  /** Current snapshot (the server passes a short-lived cache over OfficeStore.snapshot). */
  snapshot: () => OfficeSnapshot
  dist?: string
}

/** Request handler with every dependency injected (tests build one without touching ~/.pi or desk state). */
export function createHandler(deps: AppDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { config, hub, snapshot } = deps
  const dist = deps.dist ?? DIST

  return async (req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value)
    const method = req.method ?? 'GET'

    const host = checkHost(config, req.headers)
    if (!host.ok) {
      return plain(req, res, host.status, host.status === 400 ? 'Bad request: missing or invalid Host\n' : 'Misdirected request: unknown host\n')
    }

    let pathname: string
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    } catch {
      return plain(req, res, 400, 'Bad request\n')
    }

    if (pathname.startsWith('/api/')) {
      const origin = checkOrigin(config, req.headers)
      if (origin.kind === 'deny') return plain(req, res, 403, 'Forbidden: origin not allowed\n')
      if (origin.kind === 'cors') {
        res.setHeader('Access-Control-Allow-Origin', origin.allowOrigin)
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      }
      if (config.allowedOrigins !== '*') res.setHeader('Vary', 'Origin')

      if (method !== 'GET' && method !== 'HEAD') return plain(req, res, 405, 'Method not allowed\n', { Allow: 'GET, HEAD' })
      if (pathname === '/api/health') return sendJson(req, res, 200, { ok: true })
      if (pathname === '/api/office') return sendJson(req, res, 200, snapshot())
      if (pathname === '/api/stream') {
        // HEAD gets the stream headers and ends at once; subscribing would hold a slot open with no body.
        if (method === 'HEAD') {
          res.writeHead(200, SSE_HEADERS)
          res.end()
          return
        }
        const bucket = clientBucket(config, req.socket.remoteAddress, req.headers)
        const refused = hub.rejection(bucket)
        if (refused === 'full') return plain(req, res, 503, 'Too many stream clients\n', { 'Retry-After': '5' })
        if (refused === 'client-limit') return plain(req, res, 429, 'Too many streams from this client\n', { 'Retry-After': '10' })
        if (!hub.add(req, res, snapshot(), bucket)) plain(req, res, 503, 'Too many stream clients\n', { 'Retry-After': '5' })
        return
      }
      return sendJson(req, res, 404, { ok: false, error: 'not found' })
    }

    if (method !== 'GET' && method !== 'HEAD') return plain(req, res, 405, 'Method not allowed\n', { Allow: 'GET, HEAD' })

    try {
      await serveStatic(req, res, pathname, dist)
    } catch {
      if (!res.headersSent) plain(req, res, 500, 'Internal error\n')
    }
  }
}

/** Memoise a snapshot source for ttlMs so request floods cannot multiply snapshot builds. */
export function cachedSnapshot(source: (now: number) => OfficeSnapshot, ttlMs = SNAPSHOT_CACHE_MS, clock: () => number = Date.now) {
  let at = -Infinity
  let value: OfficeSnapshot | null = null
  return (): OfficeSnapshot => {
    const now = clock()
    if (!value || now - at >= ttlMs || now < at) {
      value = source(now)
      at = now
    }
    return value
  }
}

// ---------------------------------------------------------------- boot

async function main(): Promise<void> {
  let config: ServerConfig
  try {
    config = loadConfig(process.env)
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error('[pi-office] configuration error: ' + error.message)
      process.exit(2)
    }
    throw error
  }

  // Desk occupancy is app-owned state (never ~/.pi): it survives restarts and deploys.
  const sessions = piSessionsLocation()
  const store = new OfficeStore(
    resolve(sessions.dir),
    undefined,
    new DeskAllocator({ file: resolve(deskStateFile()), writeDelayMs: DESK_WRITE_DELAY_MS }),
  )
  const hub = new SseHub({ maxClients: config.sseMaxClients, maxPerClient: config.ssePerClient })
  const snapshot = cachedSnapshot((now) => store.snapshot(now))
  const handle = createHandler({ config, hub, snapshot })

  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) plain(req, res, 500, 'Internal error\n')
    })
  })
  server.headersTimeout = 20_000
  server.requestTimeout = 30_000
  server.keepAliveTimeout = 5_000
  server.maxHeadersCount = 100

  await store.start()
  // Time-based transitions (and anything the watcher missed) reach SSE clients from here.
  const push = setInterval(() => {
    try {
      hub.broadcast(snapshot())
    } catch {
      /* never crash the timer */
    }
  }, PUSH_MS)
  push.unref()
  hub.prime(snapshot())

  const shutdown = () => {
    store.stop() // also flushes pending desk state
    hub.closeAll()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2_000).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  server.on('error', (error: NodeJS.ErrnoException) => {
    const hint =
      error.code === 'EADDRINUSE'
        ? ' (another Pi Office or program already uses it; stop it or set PORT)'
        : error.code === 'EACCES'
          ? ' (permission denied; use a port above 1024)'
          : ''
    console.error('[pi-office] cannot listen on ' + config.host + ':' + config.port + ': ' + error.message + hint)
    store.stop()
    process.exit(1)
  })
  server.listen(config.port, config.host, () => {
    console.log('pi-office listening on http://' + (config.host.includes(':') ? '[' + config.host + ']' : config.host) + ':' + config.port)
    console.log('sessions: ' + store.dir + ' (' + sessions.source + ')')
    if (config.publicHosts.length > 0) {
      console.log(
        'public hosts: ' + config.publicHosts.join(', ') +
          ' (model names, project basenames, tool names, token counts and timestamps are visible to anyone who can reach them)',
      )
      if (config.trustedProxies.size === 0) {
        console.log('warning: no PI_OFFICE_TRUSTED_PROXIES; viewers arriving through a local proxy share one capped client bucket. Declare the proxy for independent limits (SECURITY.md)')
      }
    }
    console.log('snapshot: ' + store.snapshot().characters.length + ' characters')
  })
}

/** True when `moduleUrl` is the script node was started with, even through a symlinked checkout or path. */
export function isEntryPoint(moduleUrl: string, argv1: string | undefined = process.argv[1]): boolean {
  if (!argv1) return false
  const real = (path: string) => {
    try {
      return realpathSync(path)
    } catch {
      return resolve(path)
    }
  }
  return real(fileURLToPath(moduleUrl)) === real(resolve(argv1))
}

if (isEntryPoint(import.meta.url)) void main()
