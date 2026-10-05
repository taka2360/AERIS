/**
 * Open-Meteo Air Quality (Copernicus CAMS): pollutant concentrations at the
 * monitoring location. All values are MODELED (CAMS global / regional), not
 * station measurements; pollen is not available for Japan.
 */
import { z } from 'zod'
import { AIR_KEYS, type AirKey, type AirQuality } from '@/domain/earth/reports'
import type { GeoPoint } from '@/domain/earth/common'
import type { SourceResult } from '@/domain/result'
import { type Instant } from '@/domain/time'
import { fetchSourceResult } from '../http'
import { localToInstant } from '../openmeteo-forecast/adapter'

const BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality'

const nums = z.array(z.number().nullable())

export const airSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  utc_offset_seconds: z.number(),
  current_units: z.record(z.string(), z.string()),
  current: z.object({ time: z.string() }).catchall(z.number().nullable()),
  hourly: z.object({ time: z.array(z.string()), pm2_5: nums, dust: nums.optional() }),
})

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
  return fetchSourceResult(
    'openmeteo-air',
    url,
    airSchema,
    (raw, now) => {
      const data = adaptAir(raw, now, now)
      return { data, provenance: data.series.provenance }
    },
    { signal },
  )
}
