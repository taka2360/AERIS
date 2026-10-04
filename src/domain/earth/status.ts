/**
 * Domain system status for the EVENT MONITOR, and alert relevance for the
 * monitoring location. Both are AERIS judgements (DERIVED) and say so via
 * their `rule`; native agency levels are shown separately.
 */
import { haversineKm } from '../derive'
import { minutesBetween, type Instant } from '../time'
import type { HazardAssessment } from './assessments'
import type { GeoPoint } from './common'
import { validAt } from './temporal'
import { intensityLabel, intensityRank, type SystemStatus } from './derive'
import type { EarthquakeEvent, NaturalEvent } from './events'

export type SystemReading = {
  status: SystemStatus
  /** One-line summary, e.g. 'M5.1 千葉県北東部 · 震度3' */
  headline?: string
  /** Event the headline refers to */
  eventId?: string
  /** Rule that produced the status (AERIS-derived) */
  rule: string
}

const SEISMIC_RULE = 'aeris:seismic-status/v1'

/** Ranks of JMA intensity classes used below. */
const I4 = intensityRank('4')
const I5L = intensityRank('5-')
const I6L = intensityRank('6-')

function maxMagnitude(e: EarthquakeEvent): number | null {
  const ms = e.measures.filter((m) => m.kind === 'earthquake.magnitude').map((m) => m.value)
  return ms.length ? Math.max(...ms) : null
}

export function quakeHeadline(e: EarthquakeEvent): string {
  const m = maxMagnitude(e)
  const parts = [m != null ? `M${m.toFixed(1)}` : 'M--', e.title]
  if (e.detail.maxIntensity) parts.push(`震度${intensityLabel(e.detail.maxIntensity)}`)
  return parts.join(' · ')
}

/**
 * SEISMIC status from recent earthquakes (AERIS rule, not a JMA product):
 *   critical  震度6弱+ within 1 h
 *   warning   震度5弱+ within 1 h, or M7+ anywhere within 3 h
 *   elevated  震度4 within 3 h, or M6+ anywhere within 6 h
 *   active    any felt quake (JMA intensity) within 1 h, or M5+ within 3 h
 *   nominal   otherwise
 */
export function seismicStatus(
  events: NaturalEvent[],
  now: Instant,
  hasData: boolean,
): SystemReading {
  if (!hasData) return { status: 'unknown', rule: SEISMIC_RULE }
  const quakes = events.filter(
    (e): e is EarthquakeEvent => e.category === 'earthquake' && e.lifecycle !== 'cancelled',
  )
  const age = (e: EarthquakeEvent) => minutesBetween(e.time.startedAt ?? now, now)
  const recent = (e: EarthquakeEvent, min: number) => age(e) >= 0 && age(e) <= min
  const ir = (e: EarthquakeEvent) => intensityRank(e.detail.maxIntensity)
  const mag = (e: EarthquakeEvent) => maxMagnitude(e) ?? 0

  const tiers: Array<[SystemStatus, (e: EarthquakeEvent) => boolean]> = [
    ['critical', (e) => recent(e, 60) && ir(e) >= I6L],
    ['warning', (e) => (recent(e, 60) && ir(e) >= I5L) || (recent(e, 180) && mag(e) >= 7)],
    ['elevated', (e) => (recent(e, 180) && ir(e) >= I4) || (recent(e, 360) && mag(e) >= 6)],
    ['active', (e) => (recent(e, 60) && ir(e) >= 1) || (recent(e, 180) && mag(e) >= 5)],
  ]
  for (const [status, test] of tiers) {
    const hit = quakes.filter(test).sort((a, b) => ir(b) - ir(a) || mag(b) - mag(a))[0]
    if (hit) return { status, headline: quakeHeadline(hit), eventId: hit.id, rule: SEISMIC_RULE }
  }
  const latest = quakes.find((e) => age(e) >= 0)
  return {
    status: 'nominal',
    headline: latest ? quakeHeadline(latest) : undefined,
    eventId: latest?.id,
    rule: SEISMIC_RULE,
  }
}

export type Relevance = 'local' | 'regional' | 'national' | 'global'

export type AlertPriority = {
  /** Native level as the agency stated it (e.g. JMA intensity '5+') */
  nativeLevel?: string
  relevance: Relevance
  distanceKm?: number
  /** True when the monitoring location is inside the affected area */
  affectsLocation: boolean
  rule: string
}

const RELEVANCE_RULE = 'aeris:alert-relevance/v1'

/**
 * How relevant an earthquake is to the monitoring location: shaking observed
 * near the location (an intensity station within 30 km at 震度4+) makes it
 * local; elsewhere in Japan it is national; outside Japan, global.
 */
export function quakeRelevance(e: EarthquakeEvent, at: GeoPoint): AlertPriority {
  const near = e.detail.stations
    .map((s) => ({ s, d: haversineKm(at.lat, at.lon, s.lat, s.lon) }))
    .filter((x) => x.d <= 30)
    .sort((a, b) => intensityRank(b.s.intensity) - intensityRank(a.s.intensity))[0]
  const epi = haversineKm(at.lat, at.lon, e.detail.hypocenter.lat, e.detail.hypocenter.lon)
  const local = !!near && intensityRank(near.s.intensity) >= I4
  return {
    nativeLevel: near?.s.intensity ?? e.detail.maxIntensity,
    relevance: local
      ? 'local'
      : epi <= 300
        ? 'regional'
        : e.detail.maxIntensity
          ? 'national'
          : 'global',
    distanceKm: Math.round(epi),
    affectsLocation: local,
    rule: RELEVANCE_RULE,
  }
}

// ── Tsunami ─────────────────────────────────────────────────────────────────

const TSUNAMI_RULE = 'aeris:tsunami-status/v1'

/** JMA's tsunami classes mapped onto the monitor's status words. */
const TSUNAMI_STATUS: SystemStatus[] = ['nominal', 'active', 'elevated', 'warning', 'critical']

/** Tsunami assessments in force at t (cleared ones excluded). */
export function activeTsunami(assessments: HazardAssessment[], t: Instant): HazardAssessment[] {
  return validAt(
    assessments.filter((a) => a.scheme === 'jma-tsunami' && a.status !== 'cancelled' && a.rank > 0),
    t,
  ).sort((a, b) => b.rank - a.rank)
}

/** Expected height as JMA states it: a qualitative word first, else metres. */
function heightText(a: HazardAssessment): string {
  const c = a.values?.maxHeightCondition
  const h = a.values?.maxHeight
  return c ? String(c) : h != null ? `${h}m` : ''
}

/**
 * TSUNAMI status: the highest JMA class in force anywhere
 * (大津波警報 → CRITICAL, 警報 → WARNING, 注意報 → ELEVATED, 予報 → ACTIVE).
 */
export function tsunamiStatus(
  assessments: HazardAssessment[],
  t: Instant,
  hasData: boolean,
): SystemReading {
  if (!hasData) return { status: 'unknown', rule: TSUNAMI_RULE }
  const active = activeTsunami(assessments, t)
  const top = active[0]
  if (!top) return { status: 'nominal', headline: '津波の発表なし', rule: TSUNAMI_RULE }
  const same = active.filter((a) => a.rank === top.rank)
  const h = heightText(top)
  return {
    status: TSUNAMI_STATUS[Math.min(4, top.rank)]!,
    headline: `${top.level.label} · ${top.area.name}${same.length > 1 ? ` ほか${same.length - 1}区` : ''}${h ? ` · 予想${h}` : ''}`,
    eventId: top.eventRef,
    rule: TSUNAMI_RULE,
  }
}

/** Forecast-area codes whose coastline lies within `maxKm` of the point. */
export function nearbyAreaCodes(
  lines: Record<string, [number, number][][]>,
  at: GeoPoint,
  maxKm = 20,
): string[] {
  const out: Array<[string, number]> = []
  for (const [code, parts] of Object.entries(lines)) {
    let best = Infinity
    for (const line of parts)
      for (const [lon, lat] of line) best = Math.min(best, haversineKm(at.lat, at.lon, lat, lon))
    if (best <= maxKm) out.push([code, best])
  }
  return out.sort((a, b) => a[1] - b[1]).map(([c]) => c)
}

/**
 * Which tsunami assessments concern the monitoring location: those for its
 * nearby coasts. A major tsunami warning (大津波警報) anywhere is national.
 */
export function tsunamiRelevance(
  active: HazardAssessment[],
  localCodes: string[],
): { local: HazardAssessment[]; national: HazardAssessment[]; rule: string } {
  return {
    local: active.filter((a) => a.area.code && localCodes.includes(a.area.code)),
    national: active.filter((a) => a.rank >= 4),
    rule: RELEVANCE_RULE,
  }
}
