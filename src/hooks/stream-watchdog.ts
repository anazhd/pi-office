/** EventSource comments are not observable: the server sends a named heartbeat instead. */
export const STREAM_STALE_MS = 45_000

export function watchStream(
  recover: () => void,
  doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> | null,
  win: Pick<Window, 'addEventListener' | 'removeEventListener'> | null,
) {
  let lastReceived = Date.now()
  const touch = () => { lastReceived = Date.now() }
  const resume = () => {
    if (doc?.hidden) return
    touch()
    recover()
  }
  const timer = setInterval(() => {
    if (!doc?.hidden && Date.now() - lastReceived >= STREAM_STALE_MS) resume()
  }, 5000)
  doc?.addEventListener('visibilitychange', resume)
  win?.addEventListener('focus', resume)
  win?.addEventListener('online', resume)
  return {
    touch,
    stop() {
      clearInterval(timer)
      doc?.removeEventListener('visibilitychange', resume)
      win?.removeEventListener('focus', resume)
      win?.removeEventListener('online', resume)
    },
  }
}
