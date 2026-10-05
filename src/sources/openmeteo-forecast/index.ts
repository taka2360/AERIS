import {
  windGridPoints,
  type GeoPoint,
  type ModelForecast,
  type WindGridTier,
  type WindSample,
} from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import { toInstant } from '@/domain/time'
import { fetchValidated } from '../http'
import { adaptForecast, adaptWindField, MODEL_LABEL } from './adapter'
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

/** 5×5 grid (~±0.3°) of current wind. Each grid point counts as one API call. */
export async function fetchWindField(
  p: GeoPoint,
  signal?: AbortSignal,
): Promise<SourceResult<WindSample[]>> {
  const lats: string[] = []
  const lons: string[] = []
  for (let iy = -2; iy <= 2; iy++) {
    for (let ix = -2; ix <= 2; ix++) {
      lats.push((p.lat + iy * 0.15).toFixed(2))
      lons.push((p.lon + ix * 0.18).toFixed(2))
    }
  }
  const q = new URLSearchParams({
    latitude: lats.join(','),
    longitude: lons.join(','),
    current: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
  })
  const r = await fetchValidated(`${BASE}?${q}`, windFieldSchema, { signal })
  if (!r.ok) return { ok: false, source: 'openmeteo', error: r.error }
  const retrievedAt = toInstant(Date.now())
  return {
    ok: true,
    data: adaptWindField(r.data),
    provenance: { source: 'openmeteo', kind: 'model', label: MODEL_LABEL, retrievedAt },
  }
}

/**
 * Coarse wind grid for zoomed-out views (180 points; each counts as one API
 * call, so the caller fetches it only while such a view is shown and keeps
 * it for hours). Open-Meteo snaps points to model cells but keeps request
 * order, which carries the "major" (thinned subset) flag across.
 */
export async function fetchWindGrid(
  tier: WindGridTier,
  signal?: AbortSignal,
): Promise<SourceResult<WindSample[]>> {
  const pts = windGridPoints(tier)
  const q = new URLSearchParams({
    latitude: pts.map((p) => p.lat.toFixed(2)).join(','),
    longitude: pts.map((p) => p.lon.toFixed(2)).join(','),
    current: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
  })
  const r = await fetchValidated(`${BASE}?${q}`, windFieldSchema, { signal })
  if (!r.ok) return { ok: false, source: 'openmeteo', error: r.error }
  const retrievedAt = toInstant(Date.now())
  const data = r.data.flatMap((p, i): WindSample[] =>
    p.current.wind_speed_10m == null || p.current.wind_direction_10m == null
      ? []
      : [
          {
            // The requested point, not the snapped cell, keeps the grid regular.
            lat: pts[i]?.lat ?? p.latitude,
            lon: pts[i]?.lon ?? p.longitude,
            speed: p.current.wind_speed_10m,
            direction: p.current.wind_direction_10m,
            major: pts[i]?.major ?? false,
          },
        ],
  )
  return {
    ok: true,
    data,
    provenance: { source: 'openmeteo', kind: 'model', label: MODEL_LABEL, retrievedAt },
  }
}
