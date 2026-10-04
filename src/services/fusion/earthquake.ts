/**
 * Earthquake fusion: JMA + USGS solutions → canonical EarthquakeEvents.
 *   1. associate() scores every cross-source pair (time, distance, depth, M)
 *   2. same-event pairs are clustered; everything else stays separate
 *   3. canonicalize() fills each field according to EARTHQUAKE_POLICY and
 *      records which source supplied it
 */
import { refKey, type EventMeasure, type SourceObservation } from '@/domain/earth/common'
import type { EarthquakeEvent } from '@/domain/earth/events'
import type { QuakeSolution } from '@/domain/earth/reports'
import { haversineKm } from '@/domain/derive'
import { epoch } from '@/domain/time'
import { associate, tolerance, type EventAssociation } from './association'
import { EARTHQUAKE_POLICY, pick, regionOf, ruleFor } from './policy'

export const EARTHQUAKE_METHOD = 'earthquake-v1'

export type QuakeEvidence = {
  timeDeltaSec: number
  distanceKm: number
  depthDeltaKm: number | null
  magnitudeDelta: number | null
}

type Obs = SourceObservation<QuakeSolution>

/**
 * JMA list times are truncated to the minute, so up to ~75 s of offset is
 * expected for the same event; agencies' epicentres differ by tens of km.
 */
export function scoreQuakes(a: Obs, b: Obs): { confidence: number; evidence: QuakeEvidence } {
  const dt = Math.abs(epoch(a.data.originTime) - epoch(b.data.originTime)) / 1000
  const dist = haversineKm(a.data.lat, a.data.lon, b.data.lat, b.data.lon)
  const dDepth =
    a.data.depthKm != null && b.data.depthKm != null
      ? Math.abs(a.data.depthKm - b.data.depthKm)
      : null
  const dMag =
    a.data.magnitude && b.data.magnitude
      ? Math.abs(a.data.magnitude.value - b.data.magnitude.value)
      : null
  const confidence =
    tolerance(dt, 75, 45) *
    tolerance(dist, 40, 50) *
    (dDepth == null ? 0.97 : tolerance(dDepth, 30, 40)) *
    (dMag == null ? 0.95 : tolerance(dMag, 0.5, 0.5))
  return {
    confidence: Math.round(confidence * 1000) / 1000,
    evidence: {
      timeDeltaSec: Math.round(dt),
      distanceKm: Math.round(dist * 10) / 10,
      depthDeltaKm: dDepth == null ? null : Math.round(dDepth * 10) / 10,
      magnitudeDelta: dMag == null ? null : Math.round(dMag * 100) / 100,
    },
  }
}

export function associateQuakes(jma: Obs[], usgs: Obs[]): EventAssociation<QuakeEvidence>[] {
  return associate(jma, usgs, scoreQuakes, EARTHQUAKE_METHOD)
}

function magnitudeMeasure(o: Obs): EventMeasure | null {
  if (!o.data.magnitude) return null
  return {
    kind: 'earthquake.magnitude',
    value: o.data.magnitude.value,
    variant: o.data.magnitude.type,
    role: 'observed',
    provenance: o.provenance,
  }
}

/** Build one canonical event from a cluster of observations of the same quake. */
export function canonicalizeQuake(cluster: Obs[], related: string[] = []): EarthquakeEvent {
  const any = cluster[0]!
  const region = regionOf(any.data.lat, any.data.lon)
  const policy = EARTHQUAKE_POLICY
  const fs = (chosen: Obs[]) => ({
    sources: chosen.map((o) => ({ source: o.source, nativeId: o.nativeId })),
    method: `${policy.method}/${region}`,
    version: policy.version,
  })

  const hypo = pick(ruleFor(policy, region, 'hypocenter'), cluster)[0] ?? any
  const intensity = pick(
    ruleFor(policy, region, 'intensity'),
    cluster.filter((o) => o.data.maxIntensity || o.data.stations?.length),
  )[0]
  const titleSrc = pick(
    ruleFor(policy, region, 'title'),
    cluster.filter((o) => o.data.areaName),
  )[0]
  const mags = pick(ruleFor(policy, region, 'magnitude'), cluster)
    .map(magnitudeMeasure)
    .filter((m): m is EventMeasure => m !== null)

  const depthMeasure: EventMeasure[] =
    hypo.data.depthKm == null
      ? []
      : [
          {
            kind: 'earthquake.depth',
            value: hypo.data.depthKm,
            unit: 'km',
            role: 'observed',
            provenance: hypo.provenance,
          },
        ]

  const fieldSources: EarthquakeEvent['fieldSources'] = {
    hypocenter: fs([hypo]),
    magnitude: fs(cluster.filter((o) => o.data.magnitude)),
  }
  if (intensity) fieldSources.intensity = fs([intensity])
  if (titleSrc) fieldSources.title = fs([titleSrc])

  const cancelled = hypo.data.cancelled === true
  const issued = cluster
    .map((o) => o.time.issuedAt)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1)

  return {
    id: `earthquake:${refKey(hypo)}`,
    category: 'earthquake',
    title: titleSrc?.data.areaName ?? 'UNKNOWN REGION',
    place: titleSrc?.data.areaName,
    geometry: { type: 'Point', coordinates: [hypo.data.lon, hypo.data.lat] },
    time: { startedAt: hypo.data.originTime, observedAt: hypo.data.originTime, issuedAt: issued },
    lifecycle: cancelled ? 'cancelled' : 'ended',
    measures: [...mags, ...depthMeasure],
    assessments: [],
    sources: cluster.map((o) => ({ source: o.source, nativeId: o.nativeId })),
    fieldSources,
    related: related.map((id) => ({ id, relation: 'related' as const })),
    derivation: 'measured',
    provenance: hypo.provenance,
    detail: {
      hypocenter: {
        lat: hypo.data.lat,
        lon: hypo.data.lon,
        depthKm: hypo.data.depthKm,
        areaName: hypo.data.areaName,
      },
      maxIntensity: intensity?.data.maxIntensity,
      stations: intensity?.data.stations ?? [],
      comments: cluster.flatMap((o) => o.data.comments ?? []),
      tsunamiFlag: cluster.some((o) => o.data.tsunamiFlag) || undefined,
    },
  }
}

export type QuakeFusion = {
  events: EarthquakeEvent[]
  associations: EventAssociation<QuakeEvidence>[]
}

/** Full pipeline. Unmatched observations become single-source events. */
export function fuseQuakes(jma: Obs[], usgs: Obs[]): QuakeFusion {
  const associations = associateQuakes(jma, usgs)
  const all = [...jma, ...usgs]
  const byKey = new Map(all.map((o) => [refKey(o), o]))

  // Union-find over same-event links.
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    const p = parent.get(k) ?? k
    if (p === k) return k
    const r = find(p)
    parent.set(k, r)
    return r
  }
  for (const a of associations)
    if (a.relation === 'same-event') parent.set(find(refKey(a.b)), find(refKey(a.a)))

  const clusters = new Map<string, Obs[]>()
  for (const o of all) {
    const root = find(refKey(o))
    clusters.set(root, [...(clusters.get(root) ?? []), o])
  }

  // Canonical ids are only known after canonicalisation; map source key → event id.
  const drafts = [...clusters.values()].map((c) => canonicalizeQuake(c))
  const eventOf = new Map<string, string>()
  for (const e of drafts) for (const s of e.sources) eventOf.set(refKey(s), e.id)

  const relatedOf = new Map<string, Set<string>>()
  for (const a of associations) {
    if (a.relation !== 'related') continue
    const ea = eventOf.get(refKey(a.a))
    const eb = eventOf.get(refKey(a.b))
    if (!ea || !eb || ea === eb) continue
    relatedOf.set(ea, (relatedOf.get(ea) ?? new Set()).add(eb))
    relatedOf.set(eb, (relatedOf.get(eb) ?? new Set()).add(ea))
  }

  const events = drafts
    .map((e) => {
      const rel = relatedOf.get(e.id)
      if (!rel) return e
      const cluster = e.sources.map((s) => byKey.get(refKey(s))!)
      return canonicalizeQuake(cluster, [...rel])
    })
    .sort((x, y) => epoch(y.time.startedAt!) - epoch(x.time.startedAt!))

  return { events, associations }
}
