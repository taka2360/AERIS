/**
 * JMA tsunami information (bosai/tsunami): warnings / advisories / forecasts
 * per forecast area (VTSE41), arrival and observed heights (VTSE51/52), and
 * the forecast-area coastlines (bosai/common/const/geojson/tsunami.json).
 */
import { z } from 'zod'
import type { SourceObservation } from '@/domain/earth/common'
import type {
  TsunamiAreaForecast,
  TsunamiReport,
  TsunamiStationObservation,
} from '@/domain/earth/reports'
import type { SourceResult } from '@/domain/result'
import { epoch, toInstant, type Instant } from '@/domain/time'
import { fetchValidated, memoized } from '../http'
import { parseCoordinate } from '../jma-quake'

const BASE = 'https://www.jma.go.jp/bosai/tsunami/data'
const AREAS_URL = 'https://www.jma.go.jp/bosai/common/const/geojson/tsunami.json'

export const listSchema = z.array(
  z.object({
    eid: z.string(),
    rdt: z.string(),
    ttl: z.string(),
    ift: z.string(),
    json: z.string(),
  }),
)

const named = z.object({ Name: z.string(), Code: z.string().optional() })
const height = z
  .object({
    TsunamiHeight: z.string().optional(),
    Condition: z.string().optional(),
    DateTime: z.string().optional(),
  })
  .optional()
const first = z
  .object({
    ArrivalTime: z.string().optional(),
    Condition: z.string().optional(),
    Initial: z.string().optional(),
  })
  .optional()

export const detailSchema = z.object({
  Head: z.object({
    Title: z.string(),
    ReportDateTime: z.string(),
    ValidDateTime: z.string().nullable().optional(),
    EventID: z.string(),
    InfoType: z.string(),
    Headline: z.object({ Text: z.string().nullable().optional() }).optional(),
  }),
  Body: z.object({
    Tsunami: z
      .object({
        Forecast: z
          .object({
            Item: z.array(
              z.object({
                Area: z.object({ Name: z.string(), Code: z.string() }),
                Category: z.object({ Kind: named, LastKind: named.optional() }),
                FirstHeight: first,
                MaxHeight: height,
              }),
            ),
          })
          .optional(),
        Observation: z
          .object({
            Item: z.array(
              z.object({
                Area: named.optional(),
                Station: z.array(
                  z.object({ Name: z.string(), FirstHeight: first, MaxHeight: height }),
                ),
              }),
            ),
          })
          .optional(),
      })
      .optional(),
    Earthquake: z
      .array(
        z.object({
          OriginTime: z.string(),
          Hypocenter: z.object({
            Area: z.object({ Name: z.string(), Coordinate: z.string().optional() }),
          }),
          Magnitude: z.string().optional(),
        }),
      )
      .optional(),
    Text: z.string().optional(),
    Comments: z.object({ WarningComment: z.object({ Text: z.string() }).optional() }).optional(),
  }),
})

export type Detail = z.infer<typeof detailSchema>

/** Merge the bulletins of one event into one report (newest bulletin wins per part). */
export function adaptBulletins(eventId: string, details: Detail[]): TsunamiReport {
  const sorted = [...details].sort(
    (a, b) => epoch(b.Head.ReportDateTime) - epoch(a.Head.ReportDateTime),
  )
  const newest = sorted[0]!
  const fcSrc = sorted.find((d) => d.Body.Tsunami?.Forecast?.Item.length)
  const forecasts: TsunamiAreaForecast[] = (fcSrc?.Body.Tsunami?.Forecast?.Item ?? []).map(
    (it) => ({
      areaCode: it.Area.Code,
      areaName: it.Area.Name,
      kindCode: it.Category.Kind.Code ?? '00',
      kindName: it.Category.Kind.Name,
      lastKindCode: it.Category.LastKind?.Code,
      maxHeight: it.MaxHeight?.TsunamiHeight,
      maxHeightCondition: it.MaxHeight?.Condition,
      firstArrival: it.FirstHeight?.ArrivalTime,
      firstArrivalCondition: it.FirstHeight?.Condition,
    }),
  )
  const obsSrc = sorted.find((d) => d.Body.Tsunami?.Observation?.Item.length)
  const observations: TsunamiStationObservation[] = (
    obsSrc?.Body.Tsunami?.Observation?.Item ?? []
  ).flatMap((it) =>
    it.Station.map((st) => ({
      station: st.Name,
      areaName: it.Area?.Name,
      firstArrival: st.FirstHeight?.ArrivalTime,
      initial: st.FirstHeight?.Initial,
      maxHeight: st.MaxHeight?.TsunamiHeight,
      maxHeightAt: st.MaxHeight?.DateTime,
      condition: st.MaxHeight?.Condition,
    })),
  )
  const eq = sorted.find((d) => d.Body.Earthquake?.length)?.Body.Earthquake?.[0]
  const c = eq?.Hypocenter.Area.Coordinate ? parseCoordinate(eq.Hypocenter.Area.Coordinate) : null
  const mag = eq?.Magnitude ? Number.parseFloat(eq.Magnitude) : NaN
  return {
    eventId,
    issuedAt: newest.Head.ReportDateTime,
    title: newest.Head.Title,
    headline: newest.Head.Headline?.Text ?? undefined,
    validUntil: newest.Head.ValidDateTime ?? undefined,
    cancelled: newest.Head.InfoType === '取消',
    forecasts,
    observations,
    origin: eq
      ? {
          time: eq.OriginTime,
          areaName: eq.Hypocenter.Area.Name,
          lat: c?.lat,
          lon: c?.lon,
          magnitude: Number.isFinite(mag) ? mag : undefined,
        }
      : undefined,
    comments: [newest.Body.Text, newest.Body.Comments?.WarningComment?.Text].filter(
      (t): t is string => !!t,
    ),
  }
}

export function reportObservation(
  r: TsunamiReport,
  retrievedAt: Instant,
): SourceObservation<TsunamiReport> {
  return {
    source: 'jma-tsunami',
    nativeId: r.eventId,
    sourceRole: 'warning',
    time: { issuedAt: r.issuedAt, validUntil: r.validUntil, startedAt: r.origin?.time },
    data: r,
    provenance: {
      source: 'jma-tsunami',
      kind: 'official',
      label: `気象庁 ${r.title}`,
      issuedAt: r.issuedAt,
      retrievedAt,
      role: 'forecast',
      sourceRole: 'warning',
    },
  }
}

/** Events with bulletins in the past `withinHours` (the list spans a few days). */
export async function fetchTsunamiReports(
  signal?: AbortSignal,
  withinHours = 48,
): Promise<SourceResult<SourceObservation<TsunamiReport>[]>> {
  const list = await fetchValidated(`${BASE}/list.json`, listSchema, { signal })
  if (!list.ok) return { ok: false, source: 'jma-tsunami', error: list.error }
  const retrievedAt = toInstant(Date.now())
  const since = Date.now() - withinHours * 3600_000
  const byEvent = new Map<string, string[]>()
  for (const x of list.data.filter((x) => epoch(x.rdt) >= since))
    byEvent.set(x.eid, [...(byEvent.get(x.eid) ?? []), x.json])
  const reports: SourceObservation<TsunamiReport>[] = []
  for (const [eid, files] of byEvent) {
    const details = await Promise.all(
      files.slice(0, 6).map((f) => fetchValidated(`${BASE}/${f}`, detailSchema, { signal })),
    )
    const ok = details.flatMap((d) => (d.ok ? [d.data] : []))
    if (ok.length === 0) {
      const err = details.find((d) => !d.ok)
      if (err && !err.ok) return { ok: false, source: 'jma-tsunami', error: err.error }
      continue
    }
    reports.push(reportObservation(adaptBulletins(eid, ok), retrievedAt))
  }
  return {
    ok: true,
    data: reports,
    provenance: {
      source: 'jma-tsunami',
      kind: 'official',
      label: '気象庁 津波情報',
      retrievedAt,
      sourceRole: 'warning',
    },
  }
}

// ── Forecast-area coastlines ────────────────────────────────────────────────

export const areasSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({ code: z.string() }),
      geometry: z.object({
        type: z.literal('MultiLineString'),
        coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
      }),
    }),
  ),
})

/** Area code → coastline polylines ([lon, lat]). */
export type TsunamiAreaLines = Record<string, [number, number][][]>

export function adaptAreas(raw: z.infer<typeof areasSchema>): TsunamiAreaLines {
  return Object.fromEntries(raw.features.map((f) => [f.properties.code, f.geometry.coordinates]))
}

const loadAreas = memoized(24 * 3600_000, async (signal) => {
  const r = await fetchValidated(AREAS_URL, areasSchema, { signal, timeoutMs: 20_000 })
  return r.ok ? { ok: true as const, data: adaptAreas(r.data) } : r
})

export async function fetchTsunamiAreas(
  signal?: AbortSignal,
): Promise<SourceResult<TsunamiAreaLines>> {
  const r = await loadAreas(signal)
  if (!r.ok) return { ok: false, source: 'jma-tsunami', error: r.error }
  return {
    ok: true,
    data: r.data,
    provenance: { source: 'jma-tsunami', kind: 'official', retrievedAt: toInstant(Date.now()) },
  }
}
