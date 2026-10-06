import type { ExtendedDaily, GeoPoint, ModelForecast, WindSample } from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import { fetchSourceResult } from '../http'
import { openMeteoQuota } from '../openmeteo-quota'
import { adaptExtendedDaily, adaptForecast, MODEL_LABEL } from './adapter'
import {
  CURRENT_VARS,
  DAILY_VARS,
  EXTENDED_DAILY_VARS,
  extendedDailySchema,
  forecastSchema,
  HOURLY_VARS,
  windFieldSchema,
} from './schema'

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
  return fetchSourceResult(
    'openmeteo',
    forecastUrl(p),
    forecastSchema,
    (raw, retrievedAt) => ({
      data: adaptForecast(raw, retrievedAt),
      provenance: { source: 'openmeteo', kind: 'model', label: MODEL_LABEL, retrievedAt },
    }),
    {
      signal,
      quota: openMeteoQuota(1, CURRENT_VARS.length + HOURLY_VARS.length + DAILY_VARS.length, 9),
    },
  )
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
  return fetchSourceResult(
    'openmeteo',
    `${BASE}?${q}`,
    windFieldSchema,
    (raw, retrievedAt) => ({
      data: raw.flatMap((p, i): WindSample[] =>
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
      ),
      provenance: { source: 'openmeteo', kind: 'model', label: MODEL_LABEL, retrievedAt },
    }),
    // Map decoration: capped so it never starves the panels.
    { signal, quota: { ...openMeteoQuota(pts.length, 2), bulk: true } },
  )
}

export function extendedDailyUrl(p: GeoPoint): string {
  const q = new URLSearchParams({
    latitude: p.lat.toFixed(2),
    longitude: p.lon.toFixed(2),
    timezone: 'Asia/Tokyo',
    wind_speed_unit: 'ms',
    past_days: '31',
    forecast_days: '16',
    daily: EXTENDED_DAILY_VARS.join(','),
  })
  return `${BASE}?${q}`
}

/** Daily values from a month back to 16 days ahead, in one light request. */
export async function fetchExtendedDaily(
  p: GeoPoint,
  signal?: AbortSignal,
): Promise<SourceResult<ExtendedDaily>> {
  return fetchSourceResult(
    'openmeteo',
    extendedDailyUrl(p),
    extendedDailySchema,
    (raw, retrievedAt) => {
      const data = adaptExtendedDaily(raw, retrievedAt)
      return { data, provenance: data.provenance }
    },
    { signal, quota: openMeteoQuota(1, EXTENDED_DAILY_VARS.length, 47) },
  )
}
