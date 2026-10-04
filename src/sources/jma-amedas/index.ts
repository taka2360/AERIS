/**
 * JMA AMeDAS. Station table (daily-ish) + national 10-minute snapshot.
 * Values are [value, qualityFlag]; only flag 0 (normal) / 1 (quasi-normal) are used.
 */
import { z } from 'zod'
import { haversineKm } from '@/domain/derive'
import type { GeoPoint, StationObservation } from '@/domain/model'
import type { SourceError, SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { fetchRaw, fetchValidated, memoized } from '../http'

const BASE = 'https://www.jma.go.jp/bosai/amedas'

const stationSchema = z.object({
  kjName: z.string(),
  lat: z.tuple([z.number(), z.number()]),
  lon: z.tuple([z.number(), z.number()]),
})
export const tableSchema = z.record(z.string(), stationSchema)
export type StationTable = z.infer<typeof tableSchema>

const reading = z.tuple([z.number().nullable(), z.number().nullable()]).optional()
const obsSchema = z
  .object({
    temp: reading,
    humidity: reading,
    pressure: reading, // sea-level pressure
    precipitation1h: reading,
    wind: reading,
    windDirection: reading, // 16-point code; 0 = calm
    gust: reading,
    sun1h: reading, // hours
    visibility: reading, // metres
  })
  .loose()
export const mapSchema = z.record(z.string(), obsSchema)
export type ObsMap = z.infer<typeof mapSchema>

export const loadStationTable = memoized(24 * 60 * 60_000, (signal) =>
  fetchValidated(`${BASE}/const/amedastable.json`, tableSchema, { signal, timeoutMs: 20_000 }),
)

const val = (r: [number | null, number | null] | undefined): number | null => {
  if (!r || r[0] == null) return null
  return r[1] == null || r[1] <= 1 ? r[0] : null
}

/** '2026-10-04T17:00:00+09:00' → '20261004170000' (JST wall clock). */
export function mapKey(latest: Instant): string {
  return latest.slice(0, 19).replace(/[-:T]/g, '')
}

export function adaptStations(
  table: StationTable,
  map: ObsMap,
  observedAt: Instant,
  center: GeoPoint,
  radiusKm = 60,
  limit = 24,
): StationObservation[] {
  const out: StationObservation[] = []
  for (const [id, st] of Object.entries(table)) {
    const lat = st.lat[0] + st.lat[1] / 60
    const lon = st.lon[0] + st.lon[1] / 60
    const distanceKm = haversineKm(center.lat, center.lon, lat, lon)
    if (distanceKm > radiusKm) continue
    const o = map[id]
    if (!o) continue
    const dirCode = val(o.windDirection)
    const wind = val(o.wind)
    const sun = val(o.sun1h)
    const vis = val(o.visibility)
    out.push({
      id,
      name: st.kjName,
      lat,
      lon,
      distanceKm: Math.round(distanceKm * 10) / 10,
      observedAt,
      temperature: val(o.temp),
      humidity: val(o.humidity),
      pressure: val(o.pressure),
      precipitation1h: val(o.precipitation1h),
      windSpeed: wind,
      windDirection: dirCode == null || dirCode === 0 ? null : (dirCode * 22.5) % 360,
      gust: val(o.gust),
      sunshine1h: sun == null ? null : Math.round(sun * 60),
      visibility: vis == null ? null : Math.round(vis / 100) / 10,
    })
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit)
}

export async function fetchStations(
  center: GeoPoint,
  signal?: AbortSignal,
): Promise<SourceResult<StationObservation[]>> {
  const fail = (error: SourceError): SourceResult<StationObservation[]> => ({
    ok: false,
    source: 'jma-amedas',
    error,
  })
  const [table, latest] = await Promise.all([
    loadStationTable(signal),
    fetchRaw(`${BASE}/data/latest_time.txt`, { signal, as: 'text' }),
  ])
  if (!table.ok) return fail(table.error)
  if (!latest.ok) return fail(latest.error)
  const observedAt = String(latest.data).trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(observedAt)) {
    return fail({ kind: 'invalid_response', message: 'bad latest_time', retryable: false })
  }
  const map = await fetchValidated(`${BASE}/data/map/${mapKey(observedAt)}.json`, mapSchema, {
    signal,
    timeoutMs: 20_000,
  })
  if (!map.ok) return fail(map.error)
  const retrievedAt = toInstant(Date.now())
  return {
    ok: true,
    data: adaptStations(table.data, map.data, observedAt, center),
    provenance: {
      source: 'jma-amedas',
      kind: 'observation',
      label: 'AMeDAS',
      observedAt,
      retrievedAt,
    },
  }
}
