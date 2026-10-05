/**
 * NASA FIRMS active-fire detections. The MAP_KEY quota is per key, so the
 * upstream is called ONLY by the cron job (fixed number of calls per hour,
 * independent of traffic); requests are served from the KV snapshot.
 */
import type { Env } from '../env'
import { fetchUpstream, json, RelayError } from '../http'

export const FIRMS_PRODUCTS = ['VIIRS_NOAA20_NRT', 'VIIRS_SNPP_NRT'] as const
const KEY = 'firms:world'
const MAX_LIMIT = 5000

/** Compact row: [lat, lon, frpMW, confidence, acquiredAtISO, satellite, daynight] */
export type FireRow = [number, number, number | null, 'l' | 'n' | 'h', string, string, 'D' | 'N']

export type FirmsSnapshot = { fetchedAt: string; products: string[]; rows: FireRow[] }

/** FIRMS VIIRS CSV → compact rows. Malformed lines are dropped. */
export function parseFirmsCsv(csv: string): FireRow[] {
  const lines = csv.trim().split(/\r?\n/)
  const header = lines.shift()?.split(',') ?? []
  const col = (name: string) => header.indexOf(name)
  const iLat = col('latitude')
  const iLon = col('longitude')
  const iFrp = col('frp')
  const iConf = col('confidence')
  const iDate = col('acq_date')
  const iTime = col('acq_time')
  const iSat = col('satellite')
  const iDn = col('daynight')
  if ([iLat, iLon, iDate, iTime].some((i) => i < 0)) return []
  const rows: FireRow[] = []
  for (const line of lines) {
    const c = line.split(',')
    const lat = Number(c[iLat])
    const lon = Number(c[iLon])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const hhmm = (c[iTime] ?? '').padStart(4, '0')
    const at = `${c[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`
    if (Number.isNaN(Date.parse(at))) continue
    const frp = Number(c[iFrp])
    const conf = (c[iConf] ?? 'n').toLowerCase().slice(0, 1)
    rows.push([
      lat,
      lon,
      Number.isFinite(frp) ? frp : null,
      conf === 'l' || conf === 'h' ? conf : 'n',
      at,
      c[iSat] ?? '',
      c[iDn] === 'N' ? 'N' : 'D',
    ])
  }
  return rows
}

export async function refreshFirms(env: Env): Promise<FirmsSnapshot> {
  if (!env.FIRMS_MAP_KEY) throw new RelayError('NOT_CONFIGURED', 'FIRMS_MAP_KEY is not set')
  const rows: FireRow[] = []
  for (const product of FIRMS_PRODUCTS) {
    const csv = await fetchUpstream(
      `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${env.FIRMS_MAP_KEY}/${product}/world/1`,
      { timeoutMs: 60_000, maxBytes: 40 * 1024 * 1024 },
    )
    rows.push(...parseFirmsCsv(csv))
  }
  const snapshot: FirmsSnapshot = {
    fetchedAt: new Date().toISOString(),
    products: [...FIRMS_PRODUCTS],
    rows,
  }
  await env.SNAPSHOTS.put(KEY, JSON.stringify(snapshot), { expirationTtl: 24 * 3600 })
  return snapshot
}

export type FirmsQuery = { bbox: [number, number, number, number]; hours: number; limit: number }

export function parseFirmsQuery(url: URL): FirmsQuery {
  const raw = url.searchParams.get('bbox') ?? '-180,-90,180,90'
  const bbox = raw.split(',').map(Number)
  if (bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v)))
    throw new RelayError('BAD_REQUEST', 'bbox must be w,s,e,n')
  const [w, s, e, n] = bbox as [number, number, number, number]
  if (w < -180 || e > 180 || s < -90 || n > 90 || w >= e || s >= n)
    throw new RelayError('BAD_REQUEST', 'bbox out of range')
  const hours = Number(url.searchParams.get('hours') ?? 24)
  if (!Number.isInteger(hours) || hours < 1 || hours > 24)
    throw new RelayError('BAD_REQUEST', 'hours must be 1–24')
  const limit = Number(url.searchParams.get('limit') ?? 2000)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new RelayError('BAD_REQUEST', `limit must be 1–${MAX_LIMIT}`)
  return { bbox: [w, s, e, n], hours, limit }
}

export async function handleFirms(url: URL, env: Env): Promise<Response> {
  const q = parseFirmsQuery(url)
  if (!env.FIRMS_MAP_KEY) throw new RelayError('NOT_CONFIGURED', 'FIRMS is not configured')
  const snap = (await env.SNAPSHOTS.get(KEY, 'json')) as FirmsSnapshot | null
  if (!snap) throw new RelayError('NOT_READY', 'no snapshot yet')
  const [w, s, e, n] = q.bbox
  const since = Date.parse(snap.fetchedAt) - q.hours * 3600_000
  const rows = snap.rows
    .filter(
      ([lat, lon, , , at]) =>
        lon >= w && lon <= e && lat >= s && lat <= n && Date.parse(at) >= since,
    )
    .sort((a, b) => (b[2] ?? 0) - (a[2] ?? 0))
  return json(
    {
      fetchedAt: snap.fetchedAt,
      products: snap.products,
      total: rows.length,
      rows: rows.slice(0, q.limit),
    },
    { headers: { 'cache-control': 'public, max-age=300' } },
  )
}
