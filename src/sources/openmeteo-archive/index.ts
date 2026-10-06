/**
 * Open-Meteo Historical Weather (ERA5 reanalysis) → climate normals.
 * One request per year of 1991–2020, each covering only the weeks around the
 * normals window (cheap in Open-Meteo's weighting, unlike one 30-year
 * request), then reduced to per-day normals by the domain.
 */
import { z } from 'zod'
import {
  computeNormals,
  NORMALS_PERIOD,
  normalsWindow,
  shiftDate,
  type ClimateDay,
  type ClimateNormals,
} from '@/domain/climate'
import type { GeoPoint } from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import { toInstant } from '@/domain/time'
import { fetchValidated } from '../http'
import { openMeteoQuota } from '../openmeteo-quota'

const BASE = 'https://archive-api.open-meteo.com/v1/archive'
const VARS = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'] as const
/** Extra days fetched each side of the window for the ±7-day smoothing */
const MARGIN = 7
const CONCURRENCY = 5

const nums = z.array(z.number().nullable())
export const archiveSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: nums,
    temperature_2m_min: nums,
    precipitation_sum: nums,
  }),
})

/** The same calendar date in another year (29 Feb → 28 Feb in common years). */
export function inYear(date: string, year: number): string {
  const md = date.slice(5)
  const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1
  return `${year}-${md === '02-29' && !leap ? '02-28' : md}`
}

export function archiveUrl(p: GeoPoint, from: string, to: string): string {
  const q = new URLSearchParams({
    latitude: p.lat.toFixed(2),
    longitude: p.lon.toFixed(2),
    start_date: from,
    end_date: to,
    daily: VARS.join(','),
    timezone: 'Asia/Tokyo',
  })
  return `${BASE}?${q}`
}

export function toClimateDays(raw: z.infer<typeof archiveSchema>): ClimateDay[] {
  const d = raw.daily
  return d.time.map((date, i) => ({
    date,
    tmax: d.temperature_2m_max[i] ?? null,
    tmin: d.temperature_2m_min[i] ?? null,
    precip: d.precipitation_sum[i] ?? null,
  }))
}

export async function fetchClimateNormals(
  p: GeoPoint,
  anchor: string,
  signal?: AbortSignal,
): Promise<SourceResult<ClimateNormals>> {
  const win = normalsWindow(anchor)
  const anchorYear = +anchor.slice(0, 4)
  const years = Array.from(
    { length: NORMALS_PERIOD.to - NORMALS_PERIOD.from + 1 },
    (_, i) => NORMALS_PERIOD.from + i,
  )
  const history: ClimateDay[] = []
  for (let i = 0; i < years.length; i += CONCURRENCY) {
    const batch = years.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map((y) => {
        const offset = y - anchorYear
        const from = shiftDate(inYear(win.from, +win.from.slice(0, 4) + offset), -MARGIN)
        const to = shiftDate(inYear(win.to, +win.to.slice(0, 4) + offset), MARGIN)
        const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1
        return fetchValidated(archiveUrl(p, from, to), archiveSchema, {
          signal,
          timeoutMs: 20_000,
          quota: openMeteoQuota(1, VARS.length, days),
        })
      }),
    )
    for (const r of results) {
      if (!r.ok) return { ok: false, source: 'openmeteo-archive', error: r.error }
      history.push(...toClimateDays(r.data))
    }
  }
  const dates: string[] = []
  for (let d = win.from; d <= win.to; d = shiftDate(d, 1)) dates.push(d)
  const retrievedAt = toInstant(Date.now())
  const provenance = {
    source: 'openmeteo-archive' as const,
    kind: 'model' as const,
    label: `ERA5 ${NORMALS_PERIOD.from}–${NORMALS_PERIOD.to}`,
    retrievedAt,
  }
  return {
    ok: true,
    data: { anchor, days: computeNormals(history, dates), provenance },
    provenance,
  }
}
