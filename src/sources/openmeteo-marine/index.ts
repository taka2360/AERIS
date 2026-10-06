/**
 * Open-Meteo Marine: waves, swell, sea-surface temperature, currents and sea
 * level at the nearest sea cell. MODELED values; accuracy is limited near
 * coasts and the cell may lie some distance from the monitoring location.
 */
import { z } from 'zod'
import {
  MARINE_KEYS,
  type MarineGrid,
  type MarineKey,
  type MarineState,
} from '@/domain/earth/reports'
import type { GeoPoint } from '@/domain/earth/common'
import type { SourceResult } from '@/domain/result'
import { haversineKm } from '@/domain/derive'
import { toInstant, type Instant } from '@/domain/time'
import { fetchSourceResult } from '../http'
import { openMeteoQuota } from '../openmeteo-quota'
import { localToInstant } from '../openmeteo-forecast/adapter'

const BASE = 'https://marine-api.open-meteo.com/v1/marine'

const nums = z.array(z.number().nullable())

export const marineSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  utc_offset_seconds: z.number(),
  current: z.object({ time: z.string() }).catchall(z.number().nullable()),
  hourly: z.object({
    time: z.array(z.string()),
    wave_height: nums,
    sea_surface_temperature: nums.optional(),
    sea_level_height_msl: nums.optional(),
  }),
})

export function adaptMarine(
  raw: z.infer<typeof marineSchema>,
  at: GeoPoint,
  now: Instant,
  retrievedAt: Instant,
): MarineState {
  const off = raw.utc_offset_seconds
  const current: Partial<Record<MarineKey, number | null>> = {}
  for (const k of MARINE_KEYS) {
    const v = raw.current[k]
    current[k] = typeof v === 'number' ? v : null
  }
  const cellDistanceKm = Math.round(haversineKm(at.lat, at.lon, raw.latitude, raw.longitude))
  return {
    at: localToInstant(raw.current.time, off),
    cellDistanceKm,
    current,
    series: {
      lat: raw.latitude,
      lon: raw.longitude,
      units: { wave_height: 'm', sst: '°C', sea_level: 'm' },
      points: raw.hourly.time.map((t, i) => {
        const time = localToInstant(t, off)
        return {
          time,
          role: time <= now ? ('analysis' as const) : ('forecast' as const),
          values: {
            wave_height: raw.hourly.wave_height[i] ?? null,
            sst: raw.hourly.sea_surface_temperature?.[i] ?? null,
            sea_level: raw.hourly.sea_level_height_msl?.[i] ?? null,
          },
        }
      }),
      derivation: 'modeled',
      provenance: {
        source: 'openmeteo-marine',
        kind: 'model',
        label: 'Open-Meteo Marine',
        observedAt: localToInstant(raw.current.time, off),
        retrievedAt,
        role: 'analysis',
        derivation: 'modeled',
        sourceRole: 'forecast',
        distanceKm: cellDistanceKm,
      },
    },
  }
}

export async function fetchMarine(
  p: GeoPoint,
  signal?: AbortSignal,
): Promise<SourceResult<MarineState>> {
  const url =
    `${BASE}?latitude=${p.lat}&longitude=${p.lon}&current=${MARINE_KEYS.join(',')}` +
    '&hourly=wave_height,sea_surface_temperature,sea_level_height_msl' +
    '&past_days=1&forecast_days=2&timezone=Asia%2FTokyo'
  return fetchSourceResult(
    'openmeteo-marine',
    url,
    marineSchema,
    (raw, now) => {
      const data = adaptMarine(raw, p, now, now)
      return { data, provenance: data.series.provenance }
    },
    { signal, quota: openMeteoQuota(1, MARINE_KEYS.length + 3, 3) },
  )
}

// ── Regional grid (map layer) ───────────────────────────────────────────────

/** Japan's seas on a 3° grid: one multi-location request (~80 points). */
export const GRID_LATS = [24, 27, 30, 33, 36, 39, 42, 45]
export const GRID_LONS = [123, 126, 129, 132, 135, 138, 141, 144, 147, 150]

const gridSchema = z.array(
  z.object({
    latitude: z.number(),
    longitude: z.number(),
    utc_offset_seconds: z.number(),
    current: z.object({
      time: z.string(),
      wave_height: z.number().nullable(),
      wave_direction: z.number().nullable(),
      sea_surface_temperature: z.number().nullable(),
    }),
  }),
)

export function adaptGrid(raw: z.infer<typeof gridSchema>): MarineGrid {
  const first = raw[0]
  return {
    // Normalised to a JST instant whatever timezone the response used.
    at: toInstant(
      first ? Date.parse(localToInstant(first.current.time, first.utc_offset_seconds)) : Date.now(),
    ),
    // Land cells come back without waves: they are not sea, not "calm".
    cells: raw.flatMap((r) =>
      r.current.wave_height == null
        ? []
        : [
            {
              lat: r.latitude,
              lon: r.longitude,
              wave: r.current.wave_height,
              dir: r.current.wave_direction,
              sst: r.current.sea_surface_temperature,
            },
          ],
    ),
  }
}

export async function fetchMarineGrid(signal?: AbortSignal): Promise<SourceResult<MarineGrid>> {
  const lats: number[] = []
  const lons: number[] = []
  for (const la of GRID_LATS)
    for (const lo of GRID_LONS) {
      lats.push(la)
      lons.push(lo)
    }
  const url =
    `${BASE}?latitude=${lats.join(',')}&longitude=${lons.join(',')}` +
    '&current=wave_height,wave_direction,sea_surface_temperature'
  return fetchSourceResult(
    'openmeteo-marine',
    url,
    gridSchema,
    (raw, retrievedAt) => {
      const data = adaptGrid(raw)
      return {
        data,
        provenance: {
          source: 'openmeteo-marine',
          kind: 'model',
          label: 'Open-Meteo Marine grid',
          observedAt: data.at,
          retrievedAt,
          role: 'analysis',
          derivation: 'modeled',
          sourceRole: 'forecast',
        },
      }
    },
    {
      signal,
      timeoutMs: 20_000,
      // Map layer: one call per grid point.
      quota: { ...openMeteoQuota(lats.length, 3), bulk: true },
    },
  )
}
