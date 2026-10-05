/**
 * JMA earthquake information (bosai/quake). The list holds every bulletin
 * (several per event); bulletins are grouped by event id and the newest
 * one wins. The detail JSON adds per-station seismic intensity.
 */
import { z } from 'zod'
import type { SourceObservation } from '@/domain/earth/common'
import type { IntensityObservation } from '@/domain/earth/events'
import type { QuakeSolution } from '@/domain/earth/reports'
import type { SourceResult } from '@/domain/result'
import { epoch, toInstant, type Instant } from '@/domain/time'
import { fetchValidated } from '../http'

const BASE = 'https://www.jma.go.jp/bosai/quake/data'

export const listSchema = z.array(
  z.object({
    eid: z.string(),
    rdt: z.string(),
    ttl: z.string(),
    ift: z.string(),
    at: z.string(),
    anm: z.string(),
    cod: z.string(),
    mag: z.string(),
    maxi: z.string(),
    json: z.string(),
    en_anm: z.string().optional(),
  }),
)
export type ListEntry = z.infer<typeof listSchema>[number]

const stationSchema = z.object({
  Name: z.string(),
  Code: z.string(),
  Int: z.string(),
  latlon: z.object({ lat: z.number(), lon: z.number() }).optional(),
})

export const detailSchema = z.object({
  Head: z.object({ Title: z.string(), ReportDateTime: z.string(), EventID: z.string() }),
  Body: z.object({
    Earthquake: z
      .object({
        OriginTime: z.string(),
        Hypocenter: z.object({
          Area: z.object({ Name: z.string(), Coordinate: z.string() }),
        }),
        Magnitude: z.string(),
      })
      .optional(),
    Intensity: z
      .object({
        Observation: z.object({
          MaxInt: z.string().optional(),
          Pref: z.array(
            z.object({
              Area: z.array(
                z.object({
                  City: z.array(z.object({ IntensityStation: z.array(stationSchema) })),
                }),
              ),
            }),
          ),
        }),
      })
      .optional(),
    Comments: z
      .object({
        ForecastComment: z.object({ Text: z.string() }).optional(),
        VarComment: z.object({ Text: z.string() }).optional(),
      })
      .optional(),
  }),
})

/**
 * ISO 6709-ish JMA coordinate: '+35.8+140.7-50000/' (depth in metres, negative
 * down), '+34.8+139.4+0/' (very shallow), '-21.2+168.5/' (no depth).
 */
export function parseCoordinate(
  cod: string,
): { lat: number; lon: number; depthKm: number | null } | null {
  const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+)?\/?$/.exec(cod.trim())
  if (!m) return null
  const depth = m[3] == null ? null : Math.abs(Number(m[3])) / 1000
  return { lat: Number(m[1]), lon: Number(m[2]), depthKm: depth }
}

function parseMagnitude(mag: string): { value: number; type: string } | null {
  const v = Number.parseFloat(mag)
  return Number.isFinite(v) ? { value: v, type: 'Mj' } : null
}

/** One observation per event id from the newest bulletin that has a hypocenter. */
export function adaptList(
  entries: ListEntry[],
  retrievedAt: Instant,
): SourceObservation<QuakeSolution>[] {
  const byEvent = new Map<string, ListEntry[]>()
  for (const e of entries) byEvent.set(e.eid, [...(byEvent.get(e.eid) ?? []), e])

  const out: SourceObservation<QuakeSolution>[] = []
  for (const [eid, list] of byEvent) {
    const sorted = [...list].sort((a, b) => epoch(b.rdt) - epoch(a.rdt))
    const newest = sorted[0]!
    const located = sorted.find((e) => parseCoordinate(e.cod))
    if (!located) continue // 震度速報 only: no hypocenter yet
    const c = parseCoordinate(located.cod)!
    const maxIntensity = sorted.find((e) => e.maxi)?.maxi || undefined
    const preliminary = sorted.every((e) => e.ttl === '震度速報' || e.ttl === '震源に関する情報')
    out.push({
      source: 'jma-quake',
      nativeId: eid,
      sourceRole: 'observation',
      time: { startedAt: located.at, issuedAt: newest.rdt },
      data: {
        originTime: located.at,
        lat: c.lat,
        lon: c.lon,
        depthKm: c.depthKm,
        magnitude: parseMagnitude(located.mag),
        areaName: located.anm || undefined,
        maxIntensity,
        bulletin: newest.ttl,
        cancelled: newest.ift === '取消',
        url: `${BASE}/${newest.json}`,
      },
      provenance: {
        source: 'jma-quake',
        kind: 'official',
        label: `気象庁 ${newest.ttl}`,
        issuedAt: newest.rdt,
        observedAt: located.at,
        retrievedAt,
        role: 'observed',
        derivation: 'measured',
        quality: preliminary ? 'preliminary' : 'confirmed',
        sourceRole: 'observation',
      },
    })
  }
  return out.sort((a, b) => epoch(b.data.originTime) - epoch(a.data.originTime))
}

/** Merge a detail bulletin into an existing observation (stations, comments). */
export function adaptDetail(
  obs: SourceObservation<QuakeSolution>,
  detail: z.infer<typeof detailSchema>,
): SourceObservation<QuakeSolution> {
  const stations: IntensityObservation[] = []
  for (const pref of detail.Body.Intensity?.Observation.Pref ?? [])
    for (const area of pref.Area)
      for (const city of area.City)
        for (const st of city.IntensityStation)
          if (st.latlon)
            stations.push({
              code: st.Code,
              name: st.Name,
              lat: st.latlon.lat,
              lon: st.latlon.lon,
              intensity: st.Int,
            })
  const comments = [
    detail.Body.Comments?.ForecastComment?.Text,
    detail.Body.Comments?.VarComment?.Text,
  ].filter((t): t is string => !!t)
  const eq = detail.Body.Earthquake
  const c = eq ? parseCoordinate(eq.Hypocenter.Area.Coordinate) : null
  return {
    ...obs,
    data: {
      ...obs.data,
      ...(c ? { lat: c.lat, lon: c.lon, depthKm: c.depthKm } : {}),
      ...(eq ? { originTime: eq.OriginTime, magnitude: parseMagnitude(eq.Magnitude) } : {}),
      maxIntensity: detail.Body.Intensity?.Observation.MaxInt ?? obs.data.maxIntensity,
      stations,
      comments,
    },
  }
}

export async function fetchJmaQuakes(
  signal?: AbortSignal,
): Promise<SourceResult<SourceObservation<QuakeSolution>[]>> {
  const r = await fetchValidated(`${BASE}/list.json`, listSchema, { signal })
  if (!r.ok) return { ok: false, source: 'jma-quake', error: r.error }
  const retrievedAt = toInstant(Date.now())
  const data = adaptList(r.data, retrievedAt)
  return {
    ok: true,
    data,
    provenance: {
      source: 'jma-quake',
      kind: 'official',
      label: '気象庁 地震情報',
      issuedAt: r.data[0]?.rdt,
      retrievedAt,
      sourceRole: 'observation',
    },
  }
}

export async function fetchJmaQuakeDetail(
  obs: SourceObservation<QuakeSolution>,
  signal?: AbortSignal,
): Promise<SourceResult<SourceObservation<QuakeSolution>>> {
  if (!obs.data.url)
    return {
      ok: false,
      source: 'jma-quake',
      error: { kind: 'invalid_response', message: 'no detail url', retryable: false },
    }
  const r = await fetchValidated(obs.data.url, detailSchema, { signal })
  if (!r.ok) return { ok: false, source: 'jma-quake', error: r.error }
  return { ok: true, data: adaptDetail(obs, r.data), provenance: obs.provenance }
}
