// Runtime configuration and request-boundary checks (Host, Origin, client identity). Pure and unit tested.
//
// Secure by default: loopback bind, loopback Host names only, no cross-origin reads except loopback dev origins,
// forwarded headers ignored. Anything public is an explicit, documented opt-in (see SECURITY.md):
//
//   HOST / PORT                       bind address (default 127.0.0.1:6702)
//   PI_OFFICE_ALLOW_REMOTE_BIND=1     required to bind a non-loopback HOST (e.g. 0.0.0.0 on a LAN)
//   PI_OFFICE_ALLOWED_HOSTS           comma list of extra Host names served, e.g. office.example.com
//                                     (a reverse proxy/tunnel hostname). Listing one makes the office public there.
//   PI_OFFICE_ALLOWED_ORIGINS         comma list of extra cross-origin API readers (https://app.example.com), or *
//   PI_OFFICE_TRUSTED_PROXIES         comma list of proxy peer IPs whose client-IP header is believed
//   PI_OFFICE_CLIENT_IP_HEADER        x-forwarded-for (default) | cf-connecting-ip | x-real-ip
//   PI_OFFICE_SSE_MAX_CLIENTS         total live streams (default 64)
//   PI_OFFICE_SSE_PER_CLIENT          live streams per client address bucket (default 8)
import { isIP } from 'node:net'
import { envValue, type Env } from './paths.ts'

export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 6702
export const DEFAULT_SSE_MAX_CLIENTS = 64
export const DEFAULT_SSE_PER_CLIENT = 8
export const CLIENT_IP_HEADERS = ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip'] as const
export type ClientIpHeader = (typeof CLIENT_IP_HEADERS)[number]

/** Host names always served: the loopback names a local browser can use. */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const

/** Every configuration key the server reads (the setup CLI carries exactly these into service definitions). */
export const RUNTIME_ENV_KEYS = [
  'HOST',
  'PORT',
  'PI_OFFICE_ALLOW_REMOTE_BIND',
  'PI_OFFICE_ALLOWED_HOSTS',
  'PI_OFFICE_ALLOWED_ORIGINS',
  'PI_OFFICE_TRUSTED_PROXIES',
  'PI_OFFICE_CLIENT_IP_HEADER',
  'PI_OFFICE_SSE_MAX_CLIENTS',
  'PI_OFFICE_SSE_PER_CLIENT',
  'PI_OFFICE_SESSIONS_DIR',
  'PI_CODING_AGENT_SESSION_DIR',
  'PI_CODING_AGENT_DIR',
  'PI_OFFICE_STATE_FILE',
  'XDG_STATE_HOME',
] as const

export type ServerConfig = {
  host: string
  port: number
  /** Normalised Host names (lowercase, IPv6 bracketed, no port). */
  allowedHosts: ReadonlySet<string>
  /** Non-loopback entries of allowedHosts: where the snapshot is deliberately public. */
  publicHosts: readonly string[]
  /** Normalised origins (https://app.example.com), or '*' for any origin (explicit public API). */
  allowedOrigins: ReadonlySet<string> | '*'
  trustedProxies: ReadonlySet<string>
  clientIpHeader: ClientIpHeader
  sseMaxClients: number
  ssePerClient: number
}

export class ConfigError extends Error {}

const list = (env: Env, key: string): string[] =>
  (envValue(env, key) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

function boundedInt(env: Env, key: string, fallback: number, max: number): number {
  const raw = envValue(env, key)
  if (raw === null) return fallback
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max) {
    throw new ConfigError(key + ' must be a whole number from 1 to ' + max + ' (got "' + raw + '")')
  }
  return Number(raw)
}

/** Strip brackets, zone ids and IPv4-mapped IPv6; lowercase. Null for anything that is not an IP literal. */
export function normalizeIp(value: string | undefined | null): string | null {
  if (!value) return null
  let ip = value.trim().toLowerCase()
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1)
  const zone = ip.indexOf('%')
  if (zone >= 0) ip = ip.slice(0, zone)
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7)
  return isIP(ip) ? ip : null
}

function expandIpv6(ip: string): string[] {
  let text = ip
  // Embedded IPv4 tail (e.g. 64:ff9b::1.2.3.4): fold it into two hex groups.
  const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const p = v4[1].split('.').map(Number)
    text = text.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16)
  }
  const double = text.indexOf('::')
  const head = double >= 0 ? text.slice(0, double) : text
  const tail = double >= 0 ? text.slice(double + 2) : null
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const fill = tail === null ? [] : Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0')
  return [...left, ...fill, ...right].map((g) => parseInt(g || '0', 16).toString(16))
}

export function isLoopbackIp(value: string | null | undefined): boolean {
  const ip = normalizeIp(value)
  if (!ip) return false
  if (isIP(ip) === 4) return ip.startsWith('127.')
  return expandIpv6(ip).join(':') === '0:0:0:0:0:0:0:1'
}

/** Bind hosts / host names that only reach this machine. */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase()
  return h === 'localhost' || isLoopbackIp(h)
}

/** Limit bucket for an address: IPv4 as is, IPv6 by /64 (one host can trivially rotate the rest). */
export function addressBucket(ip: string): string {
  if (isIP(ip) === 4) return ip
  return expandIpv6(ip).slice(0, 4).join(':') + '::/64'
}

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const HOST_NAME = new RegExp('^' + LABEL + '(?:\\.' + LABEL + ')*$')

/** Normalise a Host header / allowlist entry to "name" or "[v6]" without port. Null when malformed. */
export function normalizeHost(value: string | undefined | null): string | null {
  if (!value) return null
  const raw = value.trim().toLowerCase()
  if (!raw || raw.length > 255) return null
  let name: string
  let port = ''
  if (raw.startsWith('[')) {
    const close = raw.indexOf(']')
    if (close < 0) return null
    const inner = raw.slice(1, close)
    const rest = raw.slice(close + 1)
    if (rest) {
      if (!rest.startsWith(':')) return null
      port = rest.slice(1)
    }
    if (isIP(inner) !== 6) return null
    name = '[' + inner + ']'
  } else {
    const colon = raw.indexOf(':')
    if (colon >= 0) {
      if (raw.indexOf(':', colon + 1) >= 0) return null // a bare IPv6 must be bracketed in Host
      port = raw.slice(colon + 1)
      if (!port) return null
      name = raw.slice(0, colon)
    } else {
      name = raw
    }
    if (name.endsWith('.')) name = name.slice(0, -1)
    if (!HOST_NAME.test(name)) return null
  }
  if (port && (!/^\d{1,5}$/.test(port) || Number(port) > 65535)) return null
  return name
}

/** Normalise an Origin header / allowlist entry (scheme://host[:port]). Null for "null", paths or other schemes. */
export function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null
  const text = value.trim()
  if (!text || text === 'null') return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
  if (text.replace(/\/$/, '').toLowerCase() !== url.origin) return null
  return url.origin
}

/** Read and validate the environment. Throws ConfigError with an actionable message. */
export function loadConfig(env: Env = process.env): ServerConfig {
  const host = envValue(env, 'HOST') ?? DEFAULT_HOST
  const port = boundedInt(env, 'PORT', DEFAULT_PORT, 65535)
  if (!isLoopbackHost(host) && envValue(env, 'PI_OFFICE_ALLOW_REMOTE_BIND') !== '1') {
    throw new ConfigError(
      'HOST=' + host + ' would accept connections from other machines. Keep the default 127.0.0.1 behind a ' +
        'reverse proxy or tunnel, or set PI_OFFICE_ALLOW_REMOTE_BIND=1 to bind it on purpose (see SECURITY.md).',
    )
  }

  const allowedHosts = new Set<string>(LOOPBACK_HOSTS)
  const publicHosts: string[] = []
  for (const entry of list(env, 'PI_OFFICE_ALLOWED_HOSTS')) {
    const name = normalizeHost(entry)
    const bare = entry.toLowerCase().replace(/\.$/, '')
    if (!name || name !== bare) {
      throw new ConfigError(
        'PI_OFFICE_ALLOWED_HOSTS entry "' + entry + '" must be a bare host name without scheme, port, path or ' +
          'wildcard (e.g. office.example.com)',
      )
    }
    if (allowedHosts.has(name)) continue
    allowedHosts.add(name)
    if (!isLoopbackHost(name.replace(/^\[|\]$/g, ''))) publicHosts.push(name)
  }

  const originEntries = list(env, 'PI_OFFICE_ALLOWED_ORIGINS')
  let allowedOrigins: Set<string> | '*'
  if (originEntries.includes('*')) {
    if (originEntries.length > 1) throw new ConfigError('PI_OFFICE_ALLOWED_ORIGINS: use either * alone or a list of origins')
    allowedOrigins = '*'
  } else {
    allowedOrigins = new Set<string>()
    for (const entry of originEntries) {
      const origin = normalizeOrigin(entry)
      if (!origin) throw new ConfigError('PI_OFFICE_ALLOWED_ORIGINS entry "' + entry + '" must look like https://app.example.com')
      allowedOrigins.add(origin)
    }
  }

  const trustedProxies = new Set<string>()
  for (const entry of list(env, 'PI_OFFICE_TRUSTED_PROXIES')) {
    const ip = normalizeIp(entry)
    if (!ip || entry.includes('/')) {
      throw new ConfigError('PI_OFFICE_TRUSTED_PROXIES entry "' + entry + '" must be a single IP address (no ranges or names)')
    }
    trustedProxies.add(ip)
  }

  const header = (envValue(env, 'PI_OFFICE_CLIENT_IP_HEADER') ?? 'x-forwarded-for').toLowerCase()
  if (!(CLIENT_IP_HEADERS as readonly string[]).includes(header)) {
    throw new ConfigError('PI_OFFICE_CLIENT_IP_HEADER must be one of ' + CLIENT_IP_HEADERS.join(', '))
  }

  return {
    host,
    port,
    allowedHosts,
    publicHosts,
    allowedOrigins,
    trustedProxies,
    clientIpHeader: header as ClientIpHeader,
    sseMaxClients: boundedInt(env, 'PI_OFFICE_SSE_MAX_CLIENTS', DEFAULT_SSE_MAX_CLIENTS, 10_000),
    ssePerClient: boundedInt(env, 'PI_OFFICE_SSE_PER_CLIENT', DEFAULT_SSE_PER_CLIENT, 10_000),
  }
}

type HeaderBag = Record<string, string | string[] | undefined>

const single = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value

/** 400 for a missing/malformed Host, 421 for a Host this server was not configured to serve (DNS rebinding). */
export function checkHost(
  config: ServerConfig,
  headers: HeaderBag,
): { ok: true; host: string } | { ok: false; status: 400 | 421 } {
  const host = normalizeHost(single(headers.host))
  if (!host) return { ok: false, status: 400 }
  if (!config.allowedHosts.has(host)) return { ok: false, status: 421 }
  return { ok: true, host }
}

export type OriginDecision =
  | { kind: 'none' } // no Origin header (curl, native apps, plain navigations)
  | { kind: 'same' } // same origin as the (already allowlisted) Host
  | { kind: 'cors'; allowOrigin: string } // allowlisted cross-origin reader
  | { kind: 'deny' }

/**
 * Cross-origin policy for /api/*. Same origin means the Origin's host:port equals the request's Host header.
 * Loopback http origins are allowed for local dev servers (Expo on :8081). Anything else needs
 * PI_OFFICE_ALLOWED_ORIGINS. Denied requests get 403, so cross-site pages cannot even hold stream slots.
 */
export function checkOrigin(config: ServerConfig, headers: HeaderBag): OriginDecision {
  if (headers.origin === undefined) return { kind: 'none' }
  const origin = normalizeOrigin(single(headers.origin))
  if (!origin) return { kind: 'deny' }
  const url = new URL(origin)
  const hostHeader = single(headers.host)?.trim().toLowerCase()
  if (hostHeader && url.host === hostHeader) return { kind: 'same' }
  if (config.allowedOrigins === '*') return { kind: 'cors', allowOrigin: '*' }
  if (config.allowedOrigins.has(origin)) return { kind: 'cors', allowOrigin: origin }
  if (url.protocol === 'http:' && isLoopbackHost(url.hostname.replace(/^\[|\]$/g, ''))) {
    return { kind: 'cors', allowOrigin: origin }
  }
  return { kind: 'deny' }
}

/**
 * Bucket for the per-client SSE cap, or null for an exempt local peer.
 *
 * Forwarded headers are believed only when the TCP peer is listed in PI_OFFICE_TRUSTED_PROXIES, so a direct client
 * cannot choose its own bucket. A trusted proxy that omits or garbles the header puts the request in one shared,
 * capped "proxy:unknown" bucket. Loopback peers are exempt only for a local-only office. Once any public host is
 * configured, even an undeclared loopback proxy shares a capped address bucket: an omitted proxy declaration
 * must not let a single remote viewer exhaust every global slot (SECURITY.md explains the trade-off).
 */
export function clientBucket(config: ServerConfig, remoteAddress: string | undefined, headers: HeaderBag): string | null {
  const peer = normalizeIp(remoteAddress)
  if (!peer) return 'peer:unknown'
  if (config.trustedProxies.has(peer)) {
    const forwarded = forwardedClient(config, headers)
    return forwarded ? addressBucket(forwarded) : 'proxy:unknown'
  }
  if (isLoopbackIp(peer) && config.publicHosts.length === 0) return null
  return addressBucket(peer)
}

function forwardedClient(config: ServerConfig, headers: HeaderBag): string | null {
  const value = headers[config.clientIpHeader]
  const joined = Array.isArray(value) ? value.join(',') : value
  if (!joined) return null
  if (config.clientIpHeader !== 'x-forwarded-for') {
    return joined.includes(',') ? null : normalizeIp(joined)
  }
  // Right to left: the last hop not added by one of our own trusted proxies is the client. Entries further left
  // were supplied by the client itself and are never believed.
  const hops = joined.split(',').map((h) => h.trim())
  for (let i = hops.length - 1; i >= 0; i--) {
    const ip = normalizeIp(hops[i])
    if (!ip) return null
    if (!config.trustedProxies.has(ip)) return ip
  }
  return null
}
