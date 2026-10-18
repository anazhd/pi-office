// Pi Office server: serves the exported Expo web app (dist/) plus the read-only office API.
//
//   GET /api/office  -> OfficeSnapshot JSON
//   GET /api/stream  -> SSE snapshots (+ 25s heartbeat)
//   GET /api/health  -> { ok: true }
//   everything else  -> static dist/ with SPA fallback
//
// Zero dependencies. Binds 127.0.0.1:6702 by default (HOST / PORT env).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { OfficeStore, sessionsDir } from './sessions.ts'
import { SseHub } from './sse.ts'

const HOST = process.env.HOST || '127.0.0.1'
const PORT = Number(process.env.PORT ?? 6702) || 6702

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST = join(ROOT, 'dist')
const PUSH_MS = 1_000

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

// ---------------------------------------------------------------- SSE hub

const hub = new SseHub()

// ---------------------------------------------------------------- static files

export function cacheControl(pathname: string): string {
  if (pathname.startsWith('/_expo/static/')) return 'public, max-age=31536000, immutable'
  return 'no-cache'
}

/** Resolve a URL path to a file inside dist/, or null when it escapes or is malformed. */
export function safePath(pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const full = resolve(DIST, '.' + (decoded.startsWith('/') ? decoded : '/' + decoded))
  if (full !== DIST && !full.startsWith(DIST + sep)) return null
  return full
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  const distExists = await pathExists(DIST)
  if (!distExists) {
    const body = NOT_BUILT_HTML
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES['.html'],
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
    return
  }

  const target = pathname === '/' ? join(DIST, 'index.html') : safePath(pathname)
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(req.method === 'HEAD' ? undefined : 'Bad request\n')
    return
  }

  let file = target
  let info = await statOrNull(file)
  if (info?.isDirectory()) {
    file = join(file, 'index.html')
    info = await statOrNull(file)
  }
  if (!info || !info.isFile()) {
    // SPA fallback: extension-less paths render the app shell; missing assets stay 404.
    const isAsset = extname(pathname) !== ''
    if (isAsset) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(req.method === 'HEAD' ? undefined : 'Not found\n')
      return
    }
    file = join(DIST, 'index.html')
    info = await statOrNull(file)
    if (!info?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(req.method === 'HEAD' ? undefined : 'Not found\n')
      return
    }
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

async function pathExists(path: string): Promise<boolean> {
  return (await statOrNull(path)) !== null
}

// ---------------------------------------------------------------- API

function sendJson(req: IncomingMessage, res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', 'http://localhost')
  const pathname = url.pathname

  if (pathname.startsWith('/api/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Allow', 'GET, HEAD')
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' })
      res.end('Method not allowed\n')
      return
    }
    if (pathname === '/api/health') return sendJson(req, res, 200, { ok: true })
    if (pathname === '/api/office') return sendJson(req, res, 200, store.snapshot())
    if (pathname === '/api/stream') {
      if (!hub.add(req, res, store.snapshot())) {
        res.writeHead(503, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Retry-After': '5',
          'Access-Control-Allow-Origin': '*',
        })
        res.end('Too many stream clients\n')
      }
      return
    }
    return sendJson(req, res, 404, { ok: false, error: 'not found' })
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' })
    res.end('Method not allowed\n')
    return
  }

  try {
    await serveStatic(req, res, pathname)
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Internal error\n')
    }
  }
}

// ---------------------------------------------------------------- boot

const store = new OfficeStore(sessionsDir())

const server = createServer((req, res) => {
  void handle(req, res).catch(() => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Internal error\n')
    }
  })
})
server.headersTimeout = 20_000
server.requestTimeout = 30_000
server.keepAliveTimeout = 5_000

async function main(): Promise<void> {
  await store.start()
  // Time-based transitions (and anything the watcher missed) reach SSE clients from here.
  const push = setInterval(() => {
    try {
      hub.broadcast(store.snapshot())
    } catch {
      /* never crash the timer */
    }
  }, PUSH_MS)
  push.unref()
  hub.prime(store.snapshot())

  server.listen(PORT, HOST, () => {
    console.log(`pi-office listening on http://${HOST}:${PORT}`)
    console.log(`sessions: ${store.dir}`)
    console.log(`snapshot: ${store.snapshot().characters.length} characters`)
  })
}

function shutdown(): void {
  store.stop()
  hub.closeAll()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2_000).unref()
}

const isMain =
  !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  void main()
}
