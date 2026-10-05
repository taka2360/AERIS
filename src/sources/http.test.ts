/**
 * Shared fetch layer: every adapter's failure modes pass through here, so the
 * error contract (kind / retryable / httpStatus) is pinned once. No live APIs —
 * `fetch` is stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toInstant } from '@/domain/time'
import { fetchRaw, fetchSourceResult, fetchValidated } from './http'

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fetchRaw', () => {
  it('returns the parsed JSON body', async () => {
    stubFetch(async () => json({ a: 1 }))
    expect(await fetchRaw('https://example.test/x')).toEqual({ ok: true, data: { a: 1 } })
  })

  it('returns text when asked', async () => {
    stubFetch(async () => new Response('plain'))
    expect(await fetchRaw('https://example.test/x', { as: 'text' })).toEqual({
      ok: true,
      data: 'plain',
    })
  })

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [404, false],
    [403, false],
  ])('maps HTTP %i to an http error (retryable: %s)', async (status, retryable) => {
    stubFetch(async () => new Response('', { status }))
    const r = await fetchRaw('https://example.test/x')
    expect(r).toEqual({
      ok: false,
      error: { kind: 'http', message: `HTTP ${status}`, httpStatus: status, retryable },
    })
  })

  it('reports a rejected fetch as a retryable network error (never throws)', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await fetchRaw('https://example.test/x')).toEqual({
      ok: false,
      error: { kind: 'network', message: 'Failed to fetch', retryable: true },
    })
  })

  it('reports a non-JSON body as invalid_response', async () => {
    stubFetch(async () => new Response('<html>not json</html>'))
    const r = await fetchRaw('https://example.test/x')
    expect(r).toMatchObject({ ok: false, error: { kind: 'invalid_response', retryable: false } })
  })

  it('reports the caller aborting as aborted, not as a network error', async () => {
    const ac = new AbortController()
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
        }),
    )
    const pending = fetchRaw('https://example.test/x', { signal: ac.signal })
    ac.abort()
    expect(await pending).toMatchObject({ ok: false, error: { kind: 'aborted', retryable: false } })
  })

  it('reports an elapsed timeout as a retryable timeout', async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('x', 'TimeoutError')),
          )
        }),
    )
    const r = await fetchRaw('https://example.test/x', { timeoutMs: 5 })
    expect(r).toMatchObject({ ok: false, error: { kind: 'timeout', retryable: true } })
  })
})

describe('fetchValidated', () => {
  const schema = z.object({ n: z.number() })

  it('passes validated data through', async () => {
    stubFetch(async () => json({ n: 3, extra: true }))
    expect(await fetchValidated('https://example.test/x', schema)).toEqual({
      ok: true,
      data: { n: 3 },
    })
  })

  it('reports a schema mismatch as invalid_response naming the path', async () => {
    stubFetch(async () => json({ n: 'three' }))
    const r = await fetchValidated('https://example.test/x', schema)
    expect(r).toMatchObject({
      ok: false,
      error: { kind: 'invalid_response', retryable: false },
    })
    if (!r.ok) expect(r.error.message).toContain('n')
  })

  it('forwards transport failures untouched', async () => {
    stubFetch(async () => new Response('', { status: 502 }))
    expect(await fetchValidated('https://example.test/x', schema)).toMatchObject({
      ok: false,
      error: { kind: 'http', httpStatus: 502 },
    })
  })
})

describe('fetchSourceResult', () => {
  const schema = z.object({ n: z.number() })
  const fixed = toInstant(Date.parse('2026-10-05T00:00:00Z'))

  it('wraps built data and provenance in a SourceResult, reading the clock once', async () => {
    stubFetch(async () => json({ n: 2 }))
    const now = vi.fn(() => fixed)
    const build = vi.fn((raw: { n: number }, retrievedAt: typeof fixed) => ({
      data: raw.n * 2,
      provenance: { source: 'usgs-quake' as const, kind: 'observation' as const, retrievedAt },
    }))
    const r = await fetchSourceResult('usgs-quake', 'https://example.test/x', schema, build, {
      now,
    })
    expect(r).toEqual({
      ok: true,
      data: 4,
      provenance: { source: 'usgs-quake', kind: 'observation', retrievedAt: fixed },
    })
    expect(now).toHaveBeenCalledTimes(1)
    expect(build).toHaveBeenCalledWith({ n: 2 }, fixed)
  })

  it('defaults to the real clock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T01:02:03Z'))
    stubFetch(async () => json({ n: 1 }))
    const r = await fetchSourceResult('eonet', 'https://example.test/x', schema, (_raw, t) => ({
      data: null,
      provenance: { source: 'eonet', kind: 'observation', retrievedAt: t },
    }))
    expect(r.ok && r.provenance.retrievedAt).toBe(toInstant(Date.parse('2026-10-05T01:02:03Z')))
  })

  it('fails with the source id and never calls build or the clock', async () => {
    stubFetch(async () => new Response('', { status: 500 }))
    const build = vi.fn()
    const now = vi.fn(() => fixed)
    const r = await fetchSourceResult('gdacs', 'https://example.test/x', schema, build, { now })
    expect(r).toMatchObject({ ok: false, source: 'gdacs', error: { kind: 'http' } })
    expect(build).not.toHaveBeenCalled()
    expect(now).not.toHaveBeenCalled()
  })

  it('reports schema mismatches against the right source', async () => {
    stubFetch(async () => json({ nope: true }))
    const r = await fetchSourceResult('gdacs', 'https://example.test/x', schema, vi.fn())
    expect(r).toMatchObject({ ok: false, source: 'gdacs', error: { kind: 'invalid_response' } })
  })
})
