/**
 * serverUrl.ts — where the office server is, derived from where the page was
 * loaded instead of a constant.
 *
 * Two ways the page is served:
 *
 *   by the office server   `npm run build && npm run server`, the packaged
 *                          desktop app. The page's own origin is the server
 *                          (it serves dist/ at /), whatever port that is:
 *                          http://127.0.0.1:3334, http://localhost:4000,
 *                          https behind a local proxy. Use location.origin
 *                          and ws(s)://<location.host>/ws.
 *   by the Vite dev server `npm run dev`, `start-office.sh`, the Electron
 *                          dev window. The server is a different process
 *                          on the port Vite was told about: vite.config.ts
 *                          defines import.meta.env.VITE_AGENT_OFFICE_PORT
 *                          from AGENT_OFFICE_PORT (default 3334). Keep the
 *                          page's hostname (localhost or 127.0.0.1, both on
 *                          the server's origin allowlist).
 *
 * The dev case is recognised by import.meta.env.DEV (true under `vite`,
 * false in a build) or by the page being on 3333, Vite's port; everything
 * else is office-served. Pure: the location and the environment come in as
 * arguments so tests pass fake ones, and nothing runs at import time, so
 * modules that import this still load in Node (the tests) where there is no
 * window — the fallback there is the default server on 127.0.0.1.
 */

export const DEFAULT_SERVER_PORT = 3334
export const VITE_DEV_PORT = 3333

/**
 * A fixed remote office server, set at build time with
 * VITE_AGENT_OFFICE_SERVER (e.g. a Cloudflare Worker that hosts the office:
 * `https://agent-office.<account>.workers.dev`). When set it wins over the
 * origin/port derivation below, so the Pages-hosted UI can talk to a Worker on
 * a different host: HTTP to this base, WebSocket to its ws(s) form + /ws. The
 * office token still travels as a subprotocol (src/officeToken.ts), and the
 * Worker already allows the Pages origin (CORS `*`, cross-origin WS upgrade).
 * Empty (the default) keeps the single-origin desktop/dev behaviour.
 */
export function officeServerBase(): string {
  const raw = (import.meta.env.VITE_AGENT_OFFICE_SERVER ?? '') as string
  return raw ? raw.replace(/\/+$/, '') : ''
}

/** The parts of window.location the helpers read. */
export interface PageLocation {
  protocol: string
  hostname: string
  host: string
  port: string
  origin: string
}

/** What Vite says about the build: dev or not, and the configured server port. */
export interface BuildEnv {
  dev: boolean
  /** import.meta.env.VITE_AGENT_OFFICE_PORT as defined in vite.config.ts */
  port?: string | number
}

const NO_WINDOW: PageLocation = {
  protocol: 'http:',
  hostname: '127.0.0.1',
  host: `127.0.0.1:${DEFAULT_SERVER_PORT}`,
  port: String(DEFAULT_SERVER_PORT),
  origin: `http://127.0.0.1:${DEFAULT_SERVER_PORT}`,
}

function pageLocation(): PageLocation {
  return typeof window !== 'undefined' && window.location ? window.location : NO_WINDOW
}

function buildEnv(): BuildEnv {
  return { dev: !!import.meta.env.DEV, port: import.meta.env.VITE_AGENT_OFFICE_PORT }
}

/** The configured server port as a number, 3334 when unset or not a port. */
export function configuredServerPort(env: BuildEnv = buildEnv()): number {
  const n = Number(env.port)
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : DEFAULT_SERVER_PORT
}

/** True when the page comes from the Vite dev server rather than the office server. */
export function isDevServerPage(loc: PageLocation = pageLocation(), env: BuildEnv = buildEnv()): boolean {
  return env.dev || loc.port === String(VITE_DEV_PORT)
}

/** The server's http(s) origin, no trailing slash: fetch(`${officeHttpBase()}/chat`). */
export function officeHttpBase(loc: PageLocation = pageLocation(), env: BuildEnv = buildEnv()): string {
  const base = officeServerBase()
  if (base) return base
  if (!isDevServerPage(loc, env)) return loc.origin
  // 127.0.0.1, never the page's own host name: `localhost` can resolve to
  // [::1] first (macOS does), where any local user could be listening while
  // the office binds 127.0.0.1 only — and the page sends its token there
  return `http://127.0.0.1:${configuredServerPort(env)}`
}

/** The WebSocket URL: wss when the page is https, ws otherwise. */
export function officeWsUrl(loc: PageLocation = pageLocation(), env: BuildEnv = buildEnv()): string {
  const base = officeServerBase()
  if (base) return `${base.replace(/^http/, 'ws')}/ws`
  if (!isDevServerPage(loc, env)) return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`
  return `ws://127.0.0.1:${configuredServerPort(env)}/ws`
}
