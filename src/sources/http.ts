/**
 * Shared fetch for source adapters: timeout + caller abort, HTTP error mapping
 * and schema validation. Never throws — failures come back as SourceError.
 */
import type { z } from 'zod'
import type { Provenance, SourceId } from '@/domain/model'
import type { SourceError, SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { parseRetryAfter, type GateTicket, type RateGate } from './rate-gate'

export type Fetched<T> = { ok: true; data: T } | { ok: false; error: SourceError }

export type FetchOptions = {
  signal?: AbortSignal
  timeoutMs?: number
  /** 'json' (default) or 'text' */
  as?: 'json' | 'text'
  /** Provider quota to check before sending (and to notify of a 429) */
  quota?: GateTicket & { gate: RateGate }
}

const DEFAULT_TIMEOUT_MS = 12_000

export async function fetchRaw(url: string, opts: FetchOptions = {}): Promise<Fetched<unknown>> {
  if (opts.quota) {
    const refused = opts.quota.gate.acquire(opts.quota)
    if (refused) return { ok: false, error: refused }
  }
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json, text/plain' } })
  } catch (e) {
    if (opts.signal?.aborted) {
      return { ok: false, error: { kind: 'aborted', message: 'aborted', retryable: false } }
    }
    if (timeout.aborted) {
      return {
        ok: false,
        error: { kind: 'timeout', message: 'request timed out', retryable: true },
      }
    }
    return {
      ok: false,
      error: {
        kind: 'network',
        message: e instanceof Error ? e.message : 'network error',
        retryable: true,
      },
    }
  }
  if (!res.ok) {
    let retryAfterMs: number | undefined
    if (res.status === 429) {
      retryAfterMs = parseRetryAfter(res.headers.get('retry-after'))
      if (opts.quota) retryAfterMs = opts.quota.gate.rejected(retryAfterMs)
    }
    return {
      ok: false,
      error: {
        kind: 'http',
        message: `HTTP ${res.status}`,
        httpStatus: res.status,
        // 4xx (other than 429) won't fix itself by retrying
        retryable: res.status >= 500 || res.status === 429,
        ...(retryAfterMs !== undefined && { retryAfterMs }),
      },
    }
  }
  try {
    const data = opts.as === 'text' ? await res.text() : await res.json()
    return { ok: true, data }
  } catch {
    return {
      ok: false,
      error: { kind: 'invalid_response', message: 'unparseable body', retryable: false },
    }
  }
}

export async function fetchValidated<S extends z.ZodType>(
  url: string,
  schema: S,
  opts: FetchOptions = {},
): Promise<Fetched<z.infer<S>>> {
  const raw = await fetchRaw(url, opts)
  if (!raw.ok) return raw
  const parsed = schema.safeParse(raw.data)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: {
        kind: 'invalid_response',
        message: `schema: ${issue?.path.join('.') ?? '?'} ${issue?.message ?? ''}`.trim(),
        retryable: false,
      },
    }
  }
  return { ok: true, data: parsed.data }
}

export type SourceFetchOptions = FetchOptions & {
  /** Clock for `retrievedAt`; defaults to the real clock. Read once per fetch. */
  now?: () => Instant
}

/**
 * fetch → Zod validation → `build` → SourceResult envelope, for the common
 * single-request adapter. Anything else (pagination, source-specific status
 * handling, multi-request composition, coordinate rounding) stays in the adapter.
 */
export async function fetchSourceResult<S extends z.ZodType, T>(
  source: SourceId,
  url: string,
  schema: S,
  build: (raw: z.infer<S>, retrievedAt: Instant) => { data: T; provenance: Provenance },
  opts: SourceFetchOptions = {},
): Promise<SourceResult<T>> {
  const { now, ...fetchOpts } = opts
  const r = await fetchValidated(url, schema, fetchOpts)
  if (!r.ok) return { ok: false, source, error: r.error }
  const { data, provenance } = build(r.data, now ? now() : toInstant(Date.now()))
  return { ok: true, data, provenance }
}

/** Memoise a slow-changing resource (e.g. station tables) in memory with a TTL. */
export function memoized<T>(ttlMs: number, load: (signal?: AbortSignal) => Promise<Fetched<T>>) {
  let cached: { at: number; data: T } | null = null
  let inflight: Promise<Fetched<T>> | null = null
  return async (signal?: AbortSignal): Promise<Fetched<T>> => {
    if (cached && Date.now() - cached.at < ttlMs) return { ok: true, data: cached.data }
    // Shared in-flight request is not tied to one caller's abort signal.
    inflight ??= load().finally(() => {
      inflight = null
    })
    const result = await raceAbort(inflight, signal)
    if (result.ok) cached = { at: Date.now(), data: result.data }
    return result
  }
}

function raceAbort<T>(p: Promise<Fetched<T>>, signal?: AbortSignal): Promise<Fetched<T>> {
  if (!signal) return p
  return new Promise((resolve) => {
    const onAbort = () =>
      resolve({ ok: false, error: { kind: 'aborted', message: 'aborted', retryable: false } })
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(resolve)
  })
}
