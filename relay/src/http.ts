/**
 * Upstream fetching and response helpers. Every failure becomes a
 * normalised JSON error: { error: { code, message } }.
 */

export type ErrorCode =
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'NOT_CONFIGURED'
  | 'NOT_READY'
  | 'NOT_AVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TOO_LARGE'

const STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  BAD_REQUEST: 400,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 503,
  NOT_READY: 503,
  NOT_AVAILABLE: 501,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
  UPSTREAM_TOO_LARGE: 502,
}

export class RelayError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { ...init, headers })
}

export function errorResponse(e: unknown): Response {
  const err = e instanceof RelayError ? e : new RelayError('UPSTREAM_ERROR', 'internal error')
  return json({ error: { code: err.code, message: err.message } }, { status: STATUS[err.code] })
}

export type UpstreamOptions = { timeoutMs?: number; maxBytes?: number; headers?: HeadersInit }

/** Fetch an upstream with a timeout and a hard cap on the body size. */
export async function fetchUpstream(url: string, opts: UpstreamOptions = {}): Promise<string> {
  const { timeoutMs = 15_000, maxBytes = 20 * 1024 * 1024 } = opts
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: opts.headers })
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    throw new RelayError(
      timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
      timeout ? 'upstream timed out' : 'upstream unreachable',
    )
  }
  if (!res.ok) throw new RelayError('UPSTREAM_ERROR', `upstream HTTP ${res.status}`)
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new RelayError('UPSTREAM_TOO_LARGE', 'upstream body too large')
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new RelayError('UPSTREAM_TOO_LARGE', 'upstream body too large')
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let off = 0
  for (const c of chunks) {
    all.set(c, off)
    off += c.byteLength
  }
  return new TextDecoder().decode(all)
}
