/**
 * Open-Meteo Flood API (Copernicus GloFAS): daily river discharge at the
 * nearest 5 km river cell. Every value is MODELED — past days are
 * reanalysis, today onwards forecast — and the nearest river may be wrong.
 */
import { z } from 'zod'
import type { DischargeKey } from '@/domain/earth/reports'
import type { PointSeries } from '@/domain/earth/fields'
import type { GeoPoint } from '@/domain/earth/common'
import type { SourceResult } from '@/domain/result'
import { jstDateKey, type Instant } from '@/domain/time'
import { fetchSourceResult } from '../http'
import { openMeteoQuota } from '../openmeteo-quota'

const BASE = 'https://flood-api.open-meteo.com/v1/flood'

export const floodSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  daily: z.object({
    time: z.array(z.string()),
    river_discharge: z.array(z.number().nullable()),
    river_discharge_median: z.array(z.number().nullable()).optional(),
    river_discharge_max: z.array(z.number().nullable()).optional(),
    river_discharge_p75: z.array(z.number().nullable()).optional(),
  }),
})

export function adaptFlood(
  raw: z.infer<typeof floodSchema>,
  now: Instant,
  retrievedAt: Instant,
): PointSeries<DischargeKey> {
  const today = jstDateKey(now)
  const d = raw.daily
  return {
    lat: raw.latitude,
    lon: raw.longitude,
    units: { discharge: 'm³/s', median: 'm³/s', max: 'm³/s', p75: 'm³/s' },
    points: d.time.map((day, i) => ({
      time: `${day}T00:00:00+09:00`,
      role: day < today ? ('analysis' as const) : ('forecast' as const),
      values: {
        discharge: d.river_discharge[i] ?? null,
        median: d.river_discharge_median?.[i] ?? null,
        max: d.river_discharge_max?.[i] ?? null,
        p75: d.river_discharge_p75?.[i] ?? null,
      },
    })),
    derivation: 'modeled',
    provenance: {
      source: 'openmeteo-flood',
      kind: 'model',
      label: 'GloFAS (Open-Meteo) 5km',
      retrievedAt,
      role: 'forecast',
      derivation: 'modeled',
      sourceRole: 'forecast',
      distanceKm: undefined,
    },
  }
}

export async function fetchRiverDischarge(
  p: GeoPoint,
  signal?: AbortSignal,
): Promise<SourceResult<PointSeries<DischargeKey>>> {
  const url =
    `${BASE}?latitude=${p.lat}&longitude=${p.lon}` +
    '&daily=river_discharge,river_discharge_median,river_discharge_max,river_discharge_p75' +
    '&past_days=7&forecast_days=14'
  return fetchSourceResult(
    'openmeteo-flood',
    url,
    floodSchema,
    (raw, now) => {
      const s = adaptFlood(raw, now, now)
      return { data: s, provenance: s.provenance }
    },
    { signal, quota: openMeteoQuota(1, 4, 21) },
  )
}
