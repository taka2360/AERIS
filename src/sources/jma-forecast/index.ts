/**
 * JMA office forecast (府県天気予報): official weather/wind/wave text for the
 * class10 forecast area.
 */
import { z } from 'zod'
import type { OfficialForecast } from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { fetchValidated } from '../http'

const areaSeries = z
  .object({
    area: z.object({ name: z.string(), code: z.string() }),
    weathers: z.array(z.string()).optional(),
    winds: z.array(z.string()).optional(),
    waves: z.array(z.string()).optional(),
  })
  .loose()

export const forecastSchema = z
  .array(
    z.object({
      reportDatetime: z.string(),
      publishingOffice: z.string(),
      timeSeries: z.array(
        z.object({ timeDefines: z.array(z.string()), areas: z.array(areaSeries) }),
      ),
    }),
  )
  .min(1)
export type JmaForecastResponse = z.infer<typeof forecastSchema>

/** Full-width spaces separate phrases in JMA text; normalise them for display. */
const IDEOGRAPHIC_SPACES = new RegExp(String.fromCharCode(0x3000) + '+', 'g')
const tidy = (s: string | undefined) => s?.replace(IDEOGRAPHIC_SPACES, ' ').trim()

export function adaptOfficial(
  r: JmaForecastResponse,
  class10: string,
  retrievedAt: Instant,
): OfficialForecast | null {
  const short = r[0]!
  const series = short.timeSeries[0]
  if (!series) return null
  const area = series.areas.find((a) => a.area.code === class10) ?? series.areas[0]
  if (!area?.weathers?.[0]) return null
  return {
    areaName: area.area.name,
    weather: tidy(area.weathers[0])!,
    wind: tidy(area.winds?.[0]),
    wave: tidy(area.waves?.[0]),
    provenance: {
      source: 'jma-forecast',
      kind: 'official',
      label: short.publishingOffice,
      issuedAt: short.reportDatetime,
      validFrom: series.timeDefines[0],
      retrievedAt,
    },
  }
}

export async function fetchOfficialForecast(
  office: string,
  class10: string,
  signal?: AbortSignal,
): Promise<SourceResult<OfficialForecast>> {
  const url = `https://www.jma.go.jp/bosai/forecast/data/forecast/${office}.json`
  const r = await fetchValidated(url, forecastSchema, { signal })
  if (!r.ok) return { ok: false, source: 'jma-forecast', error: r.error }
  const data = adaptOfficial(r.data, class10, toInstant(Date.now()))
  if (!data) {
    return {
      ok: false,
      source: 'jma-forecast',
      error: { kind: 'invalid_response', message: 'area not in forecast', retryable: false },
    }
  }
  return { ok: true, data, provenance: data.provenance }
}
