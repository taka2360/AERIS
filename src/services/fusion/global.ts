/**
 * Global events. Three kinds of statement are kept apart:
 *   EONET  — tracked phenomena (aggregation)  → NaturalEvents
 *   GDACS  — impact assessments               → HazardAssessments, linked to
 *            existing events (never merged); floods / droughts with no other
 *            source become events
 *   FIRMS  — satellite detections (observations) → WildfireEvents DERIVED by
 *            AERIS clustering ('firms-cluster-v1')
 */
import { haversineKm } from '@/domain/derive'
import type { SourceObservation } from '@/domain/earth/common'
import { normalizeLon } from '@/domain/earth/common'
import type {
  ActiveFireDetection,
  AggregatedDetail,
  CycloneEvent,
  NaturalEvent,
  WildfireEvent,
} from '@/domain/earth/events'
import { epoch, minutesBetween, toInstant, type Instant } from '@/domain/time'
import type { EonetEvent } from '@/sources/eonet'
import type { GdacsAssessment } from '@/sources/gdacs'
import type { NhcStorm } from '@/sources/relay'

const EONET_CATEGORY: Record<string, NaturalEvent['category']> = {
  severeStorms: 'severe-storm',
  wildfires: 'wildfire',
  seaLakeIce: 'sea-ice',
  floods: 'flood',
  landslides: 'landslide',
  dustHaze: 'dust-haze',
  snow: 'snow-ice',
}

export function eonetEvent(obs: SourceObservation<EonetEvent>): NaturalEvent {
  const e = obs.data
  const last = e.track.at(-1)
  const base = {
    id: `${EONET_CATEGORY[e.category] ?? 'other'}:eonet:${e.id}`,
    title: e.title,
    geometry: {
      type: 'Point' as const,
      coordinates: [last?.lon ?? 0, last?.lat ?? 0] as [number, number],
    },
    time: obs.time,
    lifecycle: e.closedAt ? ('ended' as const) : ('ongoing' as const),
    measures: last?.magnitude
      ? [
          {
            kind: `eonet.${e.category}` as `${string}.${string}`,
            value: last.magnitude.value,
            unit: last.magnitude.unit,
            role: 'observed' as const,
            provenance: obs.provenance,
          },
        ]
      : [],
    assessments: [],
    sources: [{ source: obs.source, nativeId: obs.nativeId }],
    derivation: 'derived' as const,
    provenance: obs.provenance,
  }
  const detail: AggregatedDetail = {
    nativeType: e.categoryTitle,
    url: e.link,
    description: [e.description, e.reporters.length ? `reported by ${e.reporters.join(', ')}` : '']
      .filter(Boolean)
      .join(' · '),
  }
  switch (EONET_CATEGORY[e.category]) {
    case 'wildfire':
      return { ...base, category: 'wildfire', detail: { basis: 'eonet-event' } } as WildfireEvent
    case undefined:
      return { ...base, category: 'other', detail: { ...detail, nativeCategory: e.category } }
    default:
      return { ...base, category: EONET_CATEGORY[e.category]!, detail } as NaturalEvent
  }
}

/** NHC storm (via relay) → CycloneEvent with the analysed position only. */
export function nhcEvent(
  s: NhcStorm,
  provenance: SourceObservation<unknown>['provenance'],
): CycloneEvent {
  const at = toInstant(Date.parse(s.lastUpdate))
  const p = {
    validAt: at,
    lat: s.lat,
    lon: normalizeLon(s.lon),
    pressureHpa: s.pressureMb ?? undefined,
    maxWindMs: s.intensityKt != null ? Math.round(s.intensityKt * 0.514) : undefined,
    role: 'analysis' as const,
  }
  return {
    id: `tropical-cyclone:relay-nhc:${s.id}`,
    category: 'tropical-cyclone',
    title: `${s.classification} ${s.name}`,
    geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    time: { observedAt: at, issuedAt: at },
    lifecycle: 'ongoing',
    measures: [
      ...(p.pressureHpa != null
        ? [
            {
              kind: 'cyclone.central_pressure' as const,
              value: p.pressureHpa,
              unit: 'hPa',
              role: 'analysis' as const,
              provenance,
            },
          ]
        : []),
      ...(p.maxWindMs != null
        ? [
            {
              kind: 'cyclone.max_wind' as const,
              value: p.maxWindMs,
              unit: 'm/s',
              role: 'analysis' as const,
              provenance,
            },
          ]
        : []),
    ],
    assessments: [],
    sources: [{ source: 'relay-nhc', nativeId: s.id }],
    derivation: 'measured',
    provenance,
    detail: {
      name: s.name,
      category: s.classification,
      categoryLabel: s.classification,
      observedPosition: p,
      observedTrack: [],
      forecasts: [],
      movement: {
        directionDeg: s.movementDir ?? undefined,
        speedKmh: s.movementSpeedKt != null ? Math.round(s.movementSpeedKt * 1.852) : undefined,
      },
    },
  }
}

/** GDACS types that have no other source become events; the rest are links. */
export function gdacsEvents(assessments: GdacsAssessment[]): NaturalEvent[] {
  return assessments
    .filter((a) => a.values.eventtype === 'FL' || a.values.eventtype === 'DR')
    .map((a) => {
      const base = {
        id: `${a.values.eventtype === 'FL' ? 'flood' : 'other'}:gdacs:${a.id}`,
        title: a.area.name,
        place: a.area.code,
        geometry: {
          type: 'Point' as const,
          coordinates: [a.values.lon, a.values.lat] as [number, number],
        },
        time: a.time,
        lifecycle: a.status === 'cancelled' ? ('ended' as const) : ('ongoing' as const),
        measures: [],
        assessments: [{ id: a.id, scheme: a.scheme }],
        sources: [{ source: 'gdacs' as const, nativeId: a.id }],
        derivation: 'derived' as const,
        provenance: a.provenance,
      }
      const detail = {
        nativeType: a.values.eventtype,
        url: a.values.report,
        description: a.values.severity,
      }
      return a.values.eventtype === 'FL'
        ? ({ ...base, category: 'flood', detail } as NaturalEvent)
        : ({
            ...base,
            category: 'other',
            detail: { ...detail, nativeCategory: 'drought' },
          } as NaturalEvent)
    })
}

const LINK_RADIUS_KM: Record<string, number> = { EQ: 150, TC: 600, WF: 60, VO: 50 }
const LINK_CATEGORY: Record<string, NaturalEvent['category']> = {
  EQ: 'earthquake',
  TC: 'tropical-cyclone',
  WF: 'wildfire',
  VO: 'volcano',
}

/**
 * Link each GDACS assessment to the nearest existing event of the same kind
 * (within a radius and, for earthquakes, 2 hours). Returns event id → assessments.
 */
export function linkGdacs(
  assessments: GdacsAssessment[],
  events: NaturalEvent[],
): Map<string, GdacsAssessment[]> {
  const out = new Map<string, GdacsAssessment[]>()
  for (const a of assessments) {
    const cat = LINK_CATEGORY[a.values.eventtype]
    if (!cat) continue
    let best: { id: string; d: number } | null = null
    for (const e of events) {
      if (e.category !== cat || e.geometry.type !== 'Point') continue
      const [lon, lat] = e.geometry.coordinates
      const d = haversineKm(a.values.lat, a.values.lon, lat, lon)
      if (d > (LINK_RADIUS_KM[a.values.eventtype] ?? 100)) continue
      if (cat === 'earthquake') {
        const t = e.time.startedAt
        if (!t || !a.time.startedAt || Math.abs(minutesBetween(t, a.time.startedAt)) > 120) continue
      }
      if (!best || d < best.d) best = { id: e.id, d }
    }
    if (best) out.set(best.id, [...(out.get(best.id) ?? []), a])
  }
  return out
}

/** Link EONET storms to agency cyclones nearby (related, never merged). */
export function relateStorms(events: NaturalEvent[], cyclones: CycloneEvent[]): NaturalEvent[] {
  return events.map((e) => {
    if (e.category !== 'severe-storm' || e.geometry.type !== 'Point') return e
    const [lon, lat] = e.geometry.coordinates
    const near = cyclones.filter((c) => {
      const p = c.detail.observedPosition
      return !!p && haversineKm(lat, lon, p.lat, p.lon) <= 400
    })
    return near.length
      ? { ...e, related: near.map((c) => ({ id: c.id, relation: 'related' as const })) }
      : e
  })
}

/**
 * AERIS fire clusters: detections within ~10 km (0.1° grid neighbours) in the
 * past 24 h, at least 3 per cluster. The result is a DERIVED event.
 */
export function clusterFires(
  detections: ActiveFireDetection[],
  now: Instant,
  provenance: SourceObservation<unknown>['provenance'],
): WildfireEvent[] {
  const recent = detections.filter((d) => minutesBetween(d.detectedAt, now) <= 24 * 60)
  const cell = (d: ActiveFireDetection) => `${Math.floor(d.lat * 10)}:${Math.floor(d.lon * 10)}`
  const byCell = new Map<string, ActiveFireDetection[]>()
  for (const d of recent) byCell.set(cell(d), [...(byCell.get(cell(d)) ?? []), d])
  const seen = new Set<string>()
  const clusters: ActiveFireDetection[][] = []
  for (const start of byCell.keys()) {
    if (seen.has(start)) continue
    const stack = [start]
    const members: ActiveFireDetection[] = []
    seen.add(start)
    while (stack.length) {
      const k = stack.pop()!
      members.push(...byCell.get(k)!)
      const [a, b] = k.split(':').map(Number) as [number, number]
      for (let da = -1; da <= 1; da++)
        for (let db = -1; db <= 1; db++) {
          const nk = `${a + da}:${b + db}`
          if (byCell.has(nk) && !seen.has(nk)) {
            seen.add(nk)
            stack.push(nk)
          }
        }
    }
    if (members.length >= 3) clusters.push(members)
  }
  return clusters.map((m) => {
    const lat = m.reduce((s, d) => s + d.lat, 0) / m.length
    const lon = m.reduce((s, d) => s + d.lon, 0) / m.length
    const frp = Math.max(0, ...m.map((d) => d.frpMw ?? 0))
    const times = m.map((d) => d.detectedAt).sort((x, y) => epoch(x) - epoch(y))
    return {
      id: `wildfire:aeris:${lat.toFixed(2)},${lon.toFixed(2)}`,
      category: 'wildfire',
      title: `熱異常クラスタ(${m.length}検出)`,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      time: { startedAt: times[0], observedAt: times.at(-1) },
      lifecycle: 'ongoing',
      measures: [
        { kind: 'wildfire.max_frp', value: frp, unit: 'MW', role: 'observed', provenance },
        { kind: 'wildfire.detections', value: m.length, role: 'observed', provenance },
      ],
      assessments: [],
      sources: m.slice(0, 20).map((d) => ({ source: 'relay-firms' as const, nativeId: d.id })),
      fieldSources: {
        geometry: {
          sources: m.slice(0, 20).map((d) => ({ source: 'relay-firms' as const, nativeId: d.id })),
          method: 'firms-cluster',
          version: '1',
        },
      },
      derivation: 'derived',
      provenance: { ...provenance, derivation: 'derived', label: 'AERIS cluster of NASA FIRMS' },
      detail: { basis: 'firms-cluster', detectionCount: m.length, maxFrpMw: frp },
    }
  })
}
