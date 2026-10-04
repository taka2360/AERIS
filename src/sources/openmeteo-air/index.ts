/**
 * Open-Meteo Air Quality (Copernicus CAMS): pollutant concentrations at the
 * monitoring location. All values are MODELED (CAMS global / regional), not
 * station measurements; pollen is not available for Japan.
 */
import { z } from 'zod'
import type { GeoPoint } from '@/domain/earth/common'
import type { PointSeries } from '@/domain/earth/fields'
import type { SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { fetchValidated } from '../http'
import { localToInstant } from '../openmeteo-forecast/adapter'

const BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality'

export const AIR_KEYS = [
  'pm2_5',
  'pm10',
  'ozone',
  'nitrogen_dioxide',
  'sulphur_dioxide',
  'carbon_monoxide',
  'dust',
  'aerosol_optical_depth',
  'uv_index',
] as const
export type AirKey = (typeof AIR_KEYS)[number]

const nums = z.array(z.number().nullable())

export const airSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  utc_offset_seconds: z.number(),
  current_units: z.record(z.string(), z.string()),
  current: z.object({ time: z.string() }).catchall(z.number().nullable()),
  hourly: z.object({ time: z.array(z.string()), pm2_5: nums, dust: nums.optional() }),
})

export type AirQuality = {
  at: Instant
  current: Partial<Record<AirKey, number | null>>
  units: Partial<Record<AirKey, string>>
  /** Hourly PM2.5 / dust: past day as analysis, then forecast */
  series: PointSeries<'pm2_5' | 'dust'>
}

export function adaptAir(
  raw: z.infer<typeof airSchema>,
  now: Instant,
  retrievedAt: Instant,
): AirQuality {
  const off = raw.utc_offset_seconds
  const current: Partial<Record<AirKey, number | null>> = {}
  const units: Partial<Record<AirKey, string>> = {}
  for (const k of AIR_KEYS) {
    const v = raw.current[k]
    current[k] = typeof v === 'number' ? v : null
    if (raw.current_units[k] != null) units[k] = raw.current_units[k]
  }
  const provenance = {
    source: 'openmeteo-air' as const,
    kind: 'model' as const,
    label: 'CAMS (Open-Meteo)',
    observedAt: localToInstant(raw.current.time, off),
    retrievedAt,
    role: 'analysis' as const,
    derivation: 'modeled' as const,
    sourceRole: 'forecast' as const,
  }
  return {
    at: localToInstant(raw.current.time, off),
    current,
    units,
    series: {
      lat: raw.latitude,
      lon: raw.longitude,
      units: { pm2_5: 'μg/m³', dust: 'μg/m³' },
      points: raw.hourly.time.map((t, i) => {
        const time = localToInstant(t, off)
        return {
          time,
          role: time <= now ? ('analysis' as const) : ('forecast' as const),
          values: { pm2_5: raw.hourly.pm2_5[i] ?? null, dust: raw.hourly.dust?.[i] ?? null },
        }
      }),
      derivation: 'modeled',
      provenance,
    },
  }
}

export async function fetchAirQuality(
  p: GeoPoint,
  signal?: AbortSignal,
): Promise<SourceResult<AirQuality>> {
  const url =
    `${BASE}?latitude=${p.lat}&longitude=${p.lon}&current=${AIR_KEYS.join(',')}` +
    '&hourly=pm2_5,dust&past_days=1&forecast_days=3&timezone=Asia%2FTokyo'
  const r = await fetchValidated(url, airSchema, { signal })
  if (!r.ok) return { ok: false, source: 'openmeteo-air', error: r.error }
  const now = toInstant(Date.now())
  const data = adaptAir(r.data, now, now)
  return { ok: true, data, provenance: data.series.provenance }
}
