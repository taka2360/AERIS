/**
 * JMA tropical cyclone information (bosai/typhoon): the list of active
 * cyclones, each with its analysis + forecast geometry (forecast.json) and
 * specifications (specifications.json). One issuance = one ForecastIssue.
 */
import { z } from 'zod'
import type { CycloneReport } from '@/domain/earth/reports'
import { normalizeLon, type SourceObservation } from '@/domain/earth/common'
import type { TrackPoint } from '@/domain/earth/events'
import type { SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { fetchValidated } from '../http'

const BASE = 'https://www.jma.go.jp/bosai/typhoon/data'

export const targetSchema = z.array(
  z.object({
    tropicalCyclone: z.string(),
    typhoonNumber: z.string().optional(),
    category: z.string().optional(),
    issue: z.string(),
  }),
)

const latlon = z.tuple([z.number(), z.number()])
const part = z.union([z.string(), z.object({ jp: z.string(), en: z.string().optional() })])
const jst = z.object({ JST: z.string() })

export const forecastSchema = z.array(
  z.object({
    part,
    issue: jst.optional(),
    typhoonNumber: z.string().optional(),
    name: z.object({ jp: z.string().optional(), en: z.string().optional() }).optional(),
    advancedHours: z.number().optional(),
    validtime: jst.optional(),
    center: latlon.optional(),
    track: z.record(z.string(), z.array(latlon)).optional(),
    galeWarningArea: z.object({ center: latlon, radius: z.number() }).optional(),
    probabilityCircle: z
      .object({ radius: z.number(), tangent: z.array(z.tuple([latlon, latlon])).optional() })
      .optional(),
    stormWarningArea: z.object({ line: z.array(z.tuple([latlon, latlon])).optional() }).optional(),
  }),
)

const range = z.object({ range: z.object({ km: z.number() }) })
const wind = z.object({ 'm/s': z.string().optional() }).optional()

export const specSchema = z.array(
  z.object({
    part,
    advancedHours: z.number().optional(),
    category: z.object({ jp: z.string(), en: z.string() }).optional(),
    intensity: z.string().optional(),
    scale: z.string().optional(),
    location: z.string().optional(),
    course: z.string().optional(),
    speed: z.object({ 'km/h': z.string().optional() }).optional(),
    pressure: z.string().optional(),
    maximumWind: z.object({ sustained: wind, gust: wind }).optional(),
    stormWarning: z.array(range).optional(),
    galeWarning: z.array(range).optional(),
  }),
)

const num = (v: string | undefined) => {
  const n = v == null ? NaN : Number.parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}
const maxRange = (r?: Array<{ range: { km: number } }>) =>
  r && r.length ? Math.max(...r.map((x) => x.range.km)) : undefined
const toLonLat = ([lat, lon]: [number, number]): [number, number] => [normalizeLon(lon), lat]

/** forecast.json + specifications.json → one report. */
export function adaptCyclone(
  id: string,
  fc: z.infer<typeof forecastSchema>,
  specs: z.infer<typeof specSchema>,
): CycloneReport {
  const title = fc.find((p) => p.part === 'title')
  const issuedAt = title?.issue?.JST ?? ''
  const specAt = (h: number) => specs.find((s) => s.advancedHours === h)
  const points: TrackPoint[] = fc
    .filter((p) => p.part !== 'title' && p.center && p.validtime)
    .map((p) => {
      const h = p.advancedHours ?? 0
      const sp = specAt(h)
      return {
        validAt: p.validtime!.JST,
        lat: p.center![0],
        lon: normalizeLon(p.center![1]),
        pressureHpa: num(sp?.pressure),
        maxWindMs: num(sp?.maximumWind?.sustained?.['m/s']),
        circleKm: p.probabilityCircle ? Math.round(p.probabilityCircle.radius / 1000) : undefined,
        stormAreaKm: maxRange(sp?.stormWarning),
        role: h === 0 ? ('analysis' as const) : ('forecast' as const),
      }
    })
  const analysis = fc.find((p) => p.advancedHours === 0)
  const a0 = specAt(0)
  const path = Object.values(analysis?.track ?? {})
    .flat()
    .map(toLonLat)
  const last = fc.at(-1)
  const number = title?.typhoonNumber
  return {
    id,
    number,
    name: title?.name?.jp,
    nameEn: title?.name?.en,
    issuedAt,
    category: a0?.category?.en,
    categoryLabel: a0?.category?.jp,
    intensityClass: a0?.intensity && a0.intensity !== '-' ? a0.intensity : undefined,
    sizeClass: a0?.scale,
    location: a0?.location,
    maxGustMs: num(a0?.maximumWind?.gust?.['m/s']),
    detail: {
      name: title?.name?.jp,
      number,
      category: a0?.category?.en,
      categoryLabel: a0?.category?.jp,
      intensityClass: a0?.intensity && a0.intensity !== '-' ? a0.intensity : undefined,
      sizeClass: a0?.scale,
      observedPosition: points.find((p) => p.role === 'analysis'),
      observedTrack: [],
      observedPath: path,
      forecasts: [{ issuedAt, points }],
      galeArea: analysis?.galeWarningArea
        ? {
            lat: analysis.galeWarningArea.center[0],
            lon: normalizeLon(analysis.galeWarningArea.center[1]),
            radiusKm: Math.round(analysis.galeWarningArea.radius / 1000),
          }
        : undefined,
      coneLines: fc.flatMap((p) =>
        (p.probabilityCircle?.tangent ?? []).map((t) => t.map(toLonLat)),
      ),
      stormLines: (last?.stormWarningArea?.line ?? []).map((t) => t.map(toLonLat)),
      movement: {
        directionText: a0?.course,
        speedKmh: num(a0?.speed?.['km/h']),
      },
    },
  }
}

export function cycloneObservation(
  r: CycloneReport,
  retrievedAt: Instant,
): SourceObservation<CycloneReport> {
  return {
    source: 'jma-typhoon',
    nativeId: r.id,
    sourceRole: 'forecast',
    time: { issuedAt: r.issuedAt, observedAt: r.detail.observedPosition?.validAt },
    data: r,
    provenance: {
      source: 'jma-typhoon',
      kind: 'official',
      label: '気象庁 台風情報',
      issuedAt: r.issuedAt,
      observedAt: r.detail.observedPosition?.validAt,
      retrievedAt,
      role: 'analysis',
      derivation: 'measured',
      sourceRole: 'forecast',
    },
  }
}

export async function fetchCyclones(
  signal?: AbortSignal,
): Promise<SourceResult<SourceObservation<CycloneReport>[]>> {
  const list = await fetchValidated(`${BASE}/targetTc.json`, targetSchema, { signal })
  if (!list.ok) return { ok: false, source: 'jma-typhoon', error: list.error }
  const retrievedAt = toInstant(Date.now())
  const out: SourceObservation<CycloneReport>[] = []
  for (const tc of list.data) {
    const [fc, sp] = await Promise.all([
      fetchValidated(`${BASE}/${tc.tropicalCyclone}/forecast.json`, forecastSchema, { signal }),
      fetchValidated(`${BASE}/${tc.tropicalCyclone}/specifications.json`, specSchema, { signal }),
    ])
    if (!fc.ok) return { ok: false, source: 'jma-typhoon', error: fc.error }
    out.push(
      cycloneObservation(
        adaptCyclone(tc.tropicalCyclone, fc.data, sp.ok ? sp.data : []),
        retrievedAt,
      ),
    )
  }
  return {
    ok: true,
    data: out,
    provenance: {
      source: 'jma-typhoon',
      kind: 'official',
      label: '気象庁 台風情報',
      retrievedAt,
      sourceRole: 'forecast',
    },
  }
}
