// @vitest-environment node
/**
 * Relay abuse and failure handling: unknown routes, bad queries, oversized
 * or slow upstreams, missing secrets, rate limiting and empty snapshots all
 * end in a normalised error, never an open proxy or an unbounded response.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env, KV } from './env'
import { fetchUpstream } from './http'
import worker from './index'
import { parseFirmsCsv, refreshFirms } from './routes/firms'
import { normalizeNhc } from './routes/nhc'

function memoryKV(init: Record<string, unknown> = {}): KV & { data: Map<string, string> } {
  const data = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]))
  return {
    data,
    get: async (k) => (data.has(k) ? JSON.parse(data.get(k)!) : null),
    put: async (k, v) => void data.set(k, v),
  }
}

const origin = 'https://aeris.example'
const env = (over: Partial<Env> = {}): Env => ({
  SNAPSHOTS: memoryKV(),
  ALLOWED_ORIGINS: origin,
  ...over,
})
const get = (path: string, e: Env, init: RequestInit = {}) =>
  worker.fetch(new Request(`https://relay.example${path}`, init), e)

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code
}

const CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
35.1,139.2,330.1,0.4,0.4,2026-10-04,0312,N20,VIIRS,n,2.0NRT,290.1,4.2,D
-10.5,30.25,345.0,0.5,0.4,2026-10-04,1158,N20,VIIRS,h,2.0NRT,295.0,25.7,D
bad,row
`

afterEach(() => vi.unstubAllGlobals())

describe('routing and guard', () => {
  it('rejects unknown routes and non-GET methods', async () => {
    expect((await get('/proxy?url=https://evil.example', env())).status).toBe(404)
    const post = await get('/firms', env(), { method: 'POST' })
    expect(post.status).toBe(405)
    expect(await errorCode(post)).toBe('METHOD_NOT_ALLOWED')
  })

  it('only grants CORS to configured origins', async () => {
    const ok = await get('/health', env(), { headers: { origin } })
    expect(ok.headers.get('access-control-allow-origin')).toBe(origin)
    const other = await get('/health', env(), { headers: { origin: 'https://other.example' } })
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
    const pre = await get('/firms', env(), {
      method: 'OPTIONS',
      headers: { origin: 'https://x.example' },
    })
    expect(pre.status).toBe(403)
  })

  it('rate limits per client', async () => {
    const limiter = { limit: vi.fn(async () => ({ success: false })) }
    const res = await get('/nhc', env({ RATE_LIMITER: limiter }), {
      headers: { 'cf-connecting-ip': '203.0.113.9' },
    })
    expect(res.status).toBe(429)
    expect(limiter.limit).toHaveBeenCalledWith({ key: '203.0.113.9' })
  })

  it('keeps the river relay disabled until terms are verified', async () => {
    const res = await get('/hydro', env())
    expect(res.status).toBe(501)
    expect(await errorCode(res)).toBe('NOT_AVAILABLE')
  })
})

describe('FIRMS', () => {
  it('parses VIIRS CSV and drops malformed rows', () => {
    const rows = parseFirmsCsv(CSV)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual([35.1, 139.2, 4.2, 'n', '2026-10-04T03:12:00Z', 'N20', 'D'])
  })

  it('reports NOT_CONFIGURED without a MAP_KEY and NOT_READY before the first cron run', async () => {
    expect(await errorCode(await get('/firms', env()))).toBe('NOT_CONFIGURED')
    const r = await get('/firms', env({ FIRMS_MAP_KEY: 'k' }))
    expect(r.status).toBe(503)
    expect(await errorCode(r)).toBe('NOT_READY')
  })

  it('validates bbox, hours and limit', async () => {
    const e = env({ FIRMS_MAP_KEY: 'k' })
    for (const q of ['bbox=1,2,3', 'bbox=10,0,5,5', 'bbox=-200,0,0,10', 'hours=48', 'limit=999999'])
      expect(await errorCode(await get(`/firms?${q}`, e))).toBe('BAD_REQUEST')
  })

  it('serves the snapshot filtered by bbox, strongest first, never calling upstream', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const snapshot = {
      fetchedAt: '2026-10-04T12:00:00Z',
      products: ['VIIRS_NOAA20_NRT'],
      rows: parseFirmsCsv(CSV),
    }
    const e = env({ FIRMS_MAP_KEY: 'k', SNAPSHOTS: memoryKV({ 'firms:world': snapshot }) })
    const body = (await (await get('/firms?bbox=120,20,150,50', e)).json()) as { rows: unknown[] }
    expect(body.rows).toHaveLength(1)
    const all = (await (await get('/firms', e)).json()) as { rows: Array<[number, number, number]> }
    expect(all.rows.map((r) => r[2])).toEqual([25.7, 4.2])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cron refresh stores a snapshot using the secret key', async () => {
    const fetchSpy = vi.fn(async () => new Response(CSV))
    vi.stubGlobal('fetch', fetchSpy)
    const kv = memoryKV()
    const snap = await refreshFirms(env({ FIRMS_MAP_KEY: 'secret', SNAPSHOTS: kv }))
    expect(snap.rows).toHaveLength(4) // two products × two rows
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toContain('/secret/')
    expect(kv.data.has('firms:world')).toBe(true)
  })
})

describe('upstream protection', () => {
  it('normalises slow upstreams to UPSTREAM_TIMEOUT', async () => {
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      return new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })),
        )
      })
    })
    await expect(fetchUpstream('https://x.example', { timeoutMs: 20 })).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
    })
  })

  it('refuses bodies over the size cap, declared or streamed', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('x'.repeat(2048), { headers: { 'content-length': '2048' } }),
    )
    await expect(fetchUpstream('https://x.example', { maxBytes: 1024 })).rejects.toMatchObject({
      code: 'UPSTREAM_TOO_LARGE',
    })
    vi.stubGlobal('fetch', async () => new Response('y'.repeat(4096)))
    await expect(fetchUpstream('https://x.example', { maxBytes: 1024 })).rejects.toMatchObject({
      code: 'UPSTREAM_TOO_LARGE',
    })
  })

  it('maps upstream HTTP errors to UPSTREAM_ERROR', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }))
    await expect(fetchUpstream('https://x.example')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    })
  })
})

describe('NHC', () => {
  it('normalises active storms and rejects unexpected payloads', () => {
    const storms = normalizeNhc({
      activeStorms: [
        {
          id: 'ep182026',
          name: 'Rachel',
          classification: 'HU',
          intensity: '85',
          pressure: '975',
          latitudeNumeric: 18.2,
          longitudeNumeric: -105.3,
          movementDir: 300,
          movementSpeed: 9,
          lastUpdate: '2026-10-04T09:00:00.000Z',
        },
        { id: 'broken' },
      ],
    })
    expect(storms).toHaveLength(1)
    expect(storms[0]).toMatchObject({ intensityKt: 85, pressureMb: 975, lon: -105.3 })
    expect(() => normalizeNhc({ nope: true })).toThrow()
  })
})
