/**
 * NOAA NHC active storms (Atlantic / East & Central Pacific). The upstream
 * has no CORS, so the cron job snapshots it into KV.
 */
import type { Env } from '../env'
import { fetchUpstream, json, RelayError } from '../http'

const KEY = 'nhc:current'
const URL_CURRENT = 'https://www.nhc.noaa.gov/CurrentStorms.json'

export type NhcStorm = {
  id: string
  name: string
  classification: string
  intensityKt: number | null
  pressureMb: number | null
  lat: number
  lon: number
  movementDir: number | null
  movementSpeedKt: number | null
  lastUpdate: string
}

export type NhcSnapshot = { fetchedAt: string; storms: NhcStorm[] }

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return v != null && v !== '' && Number.isFinite(n) ? n : null
}

export function normalizeNhc(raw: unknown): NhcStorm[] {
  const list = (raw as { activeStorms?: unknown[] } | null)?.activeStorms
  if (!Array.isArray(list)) throw new RelayError('UPSTREAM_ERROR', 'unexpected NHC payload')
  return list.flatMap((s) => {
    const o = s as Record<string, unknown>
    const lat = num(o.latitudeNumeric)
    const lon = num(o.longitudeNumeric)
    if (lat == null || lon == null || typeof o.id !== 'string') return []
    return [
      {
        id: o.id,
        name: String(o.name ?? ''),
        classification: String(o.classification ?? ''),
        intensityKt: num(o.intensity),
        pressureMb: num(o.pressure),
        lat,
        lon,
        movementDir: num(o.movementDir),
        movementSpeedKt: num(o.movementSpeed),
        lastUpdate: String(o.lastUpdate ?? ''),
      },
    ]
  })
}

export async function refreshNhc(env: Env): Promise<NhcSnapshot> {
  const text = await fetchUpstream(URL_CURRENT, { maxBytes: 2 * 1024 * 1024 })
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new RelayError('UPSTREAM_ERROR', 'NHC payload is not JSON')
  }
  const snapshot: NhcSnapshot = { fetchedAt: new Date().toISOString(), storms: normalizeNhc(raw) }
  await env.SNAPSHOTS.put(KEY, JSON.stringify(snapshot), { expirationTtl: 24 * 3600 })
  return snapshot
}

export async function handleNhc(env: Env): Promise<Response> {
  const snap = (await env.SNAPSHOTS.get(KEY, 'json')) as NhcSnapshot | null
  if (!snap) throw new RelayError('NOT_READY', 'no snapshot yet')
  return json(snap, { headers: { 'cache-control': 'public, max-age=300' } })
}
