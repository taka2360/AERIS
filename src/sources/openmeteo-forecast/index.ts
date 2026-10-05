import type { GeoPoint, ModelForecast, WindSample } from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import { toInstant } from '@/domain/time'
import { fetchValidated } from '../http'
import { adaptForecast, MODEL_LABEL } from './adapter'
import { CURRENT_VARS, DAILY_VARS, forecastSchema, HOURLY_VARS, windFieldSchema } from './schema'

const BASE = 'https://api.open-meteo.com/v1/forecast'

export function forecastUrl(p: GeoPoint): string {
  const q = new URLSearchParams({
    latitude: p.lat.toFixed(2),
    longitude: p.lon.toFixed(2),
    timezone: 'Asia/Tokyo',
    wind_speed_unit: 'ms',
    past_days: '1',
    forecast_days: '8',
    current: CURRENT_VARS.join(','),
    hourly: HOURLY_VARS.join(','),
    daily: DAILY_VARS.join(','),
  })
  return `${BASE}?${q}`
}

export async function fetchForecast(
  p: GeoPoint,
  signal?: AbortSignal,
): Promise<SourceResult<ModelForecast>> {
  const r = await fetchValidated(forecastUrl(p), forecastSchema, { signal })
  if (!r.ok) return { ok: false, source: 'openmeteo', error: r.error }
  const retrievedAt = toInstant(Date.now())
  const data = adaptForecast(r.data, retrievedAt)
  return {
    ok: true,
    data,
    provenance: { source: 'openmeteo', kind: 'model', label: MODEL_LABEL, retrievedAt },
  }
}

/**
 * Current wind at many points in one request (map arrows). Each point counts
 * as one API call, so the caller fetches only points it has not cached.
 * Open-Meteo snaps points to model cells but keeps request order; samples are
 * returned at the requested coordinates so the arrows stay on their lattice.
 */
export async function fetchWindAt(
  pts: GeoPoint[],
  signal?: AbortSignal,
): Promise<SourceResult<WindSample[]>> {
  const q = new URLSearchParams({
    latitude: pts.map((p) => p.lat.toFixed(3)).join(','),
    longitude: pts.map((p) => p.lon.toFixed(3)).join(','),
    current: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
  })
  // A single location comes back as an object, several as an array.
  const r = await fetchValidated(`${BASE}?${q}`, windFieldSchema, { signal })
  if (!r.ok) return { ok: false, source: 'openmeteo', error: r.error }
  const retrievedAt = toInstant(Date.now())
  const data = r.data.flatMap((p, i): WindSample[] =>
    p.current.wind_speed_10m == null || p.current.wind_direction_10m == null || !pts[i]
      ? []
      : [
          {
            lat: pts[i].lat,
            lon: pts[i].lon,
            speed: p.current.wind_speed_10m,
            direction: p.current.wind_direction_10m,
          },
        ],
  )
  return {
    ok: true,
    data,
    provenance: { source: 'openmeteo', kind: 'model', label: MODEL_LABEL, retrievedAt },
  }
}
