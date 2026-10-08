/**
 * Domain system status for the EVENT MONITOR, and alert relevance for the
 * monitoring location. Both are AERIS judgements (DERIVED) and say so via
 * their `rule`; native agency levels are shown separately.
 */
import { haversineKm } from '../derive'
import type { AlertBulletin, AlertSeverity } from '../model'
import { minutesBetween, type Instant } from '../time'
import { AIR_LEVEL_LABEL, AIR_STATUS, type AirIndex } from './air'
import type { HazardAssessment } from './assessments'
import type { GeoPoint } from './common'
import { validAt } from './temporal'
import { intensityLabel, intensityRank, SYSTEM_STATUS_RANK, type SystemStatus } from './derive'
import type { CycloneEvent, EarthquakeEvent, LightningStroke, NaturalEvent } from './events'

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

// ── Tropical cyclones ───────────────────────────────────────────────────────

const CYCLONE_RULE = 'aeris:cyclone-status/v1'

export type CycloneProximity = {
  /** Distance from the monitoring location to the analysed centre */
  distanceKm: number
  inStormArea: boolean
  inGaleArea: boolean
  /** Location falls inside a forecast storm-warning circle (any lead time) */
  inForecastStormArea: boolean
}

export function cycloneProximity(e: CycloneEvent, at: GeoPoint): CycloneProximity | null {
  const p = e.detail.observedPosition
  if (!p) return null
  const d = haversineKm(at.lat, at.lon, p.lat, p.lon)
  const g = e.detail.galeArea
  const fcst = e.detail.forecasts.at(-1)?.points ?? []
  return {
    distanceKm: Math.round(d),
    inStormArea: p.stormAreaKm != null && d <= p.stormAreaKm,
    inGaleArea: !!g && haversineKm(at.lat, at.lon, g.lat, g.lon) <= g.radiusKm,
    inForecastStormArea: fcst.some(
      (q) =>
        q.role === 'forecast' &&
        haversineKm(at.lat, at.lon, q.lat, q.lon) <= (q.stormAreaKm ?? 0) + (q.circleKm ?? 0),
    ),
  }
}

/**
 * CYCLONE status relative to the monitoring location (AERIS rule):
 *   critical  inside the storm area (暴風域) now
 *   warning   inside the gale area (強風域) now, or inside a forecast storm-warning area
 *   elevated  a cyclone centre within 1,000 km
 *   active    any cyclone being tracked
 */
export function cycloneStatus(
  events: NaturalEvent[],
  at: GeoPoint,
  hasData: boolean,
): SystemReading {
  if (!hasData) return { status: 'unknown', rule: CYCLONE_RULE }
  const tcs = events.filter((e): e is CycloneEvent => e.category === 'tropical-cyclone')
  if (tcs.length === 0)
    return { status: 'nominal', headline: '追跡中の熱帯低気圧なし', rule: CYCLONE_RULE }
  const ranked = tcs
    .map((e) => {
      const px = cycloneProximity(e, at)
      const status: SystemStatus = !px
        ? 'active'
        : px.inStormArea
          ? 'critical'
          : px.inGaleArea || px.inForecastStormArea
            ? 'warning'
            : px.distanceKm <= 1000
              ? 'elevated'
              : 'active'
      return { e, px, status }
    })
    .sort((a, b) => SYSTEM_STATUS_RANK[b.status] - SYSTEM_STATUS_RANK[a.status])
  const top = ranked[0]!
  const p = top.e.detail.observedPosition
  const parts = [top.e.title]
  if (p?.pressureHpa != null) parts.push(`${p.pressureHpa}hPa`)
  if (top.px) parts.push(`監視地点まで${top.px.distanceKm.toLocaleString('en-US')}km`)
  return { status: top.status, headline: parts.join(' · '), eventId: top.e.id, rule: CYCLONE_RULE }
}

// ── Lightning / tornado ─────────────────────────────────────────────────────

const LIGHTNING_RULE = 'aeris:lightning-status/v1'
const TORNADO_RULE = 'aeris:tornado-status/v1'

export type StrokeSummary = {
  /** Strokes with windows ending in the past 30 min (LIDEN covers Japan) */
  recent: number
  /** Nearest stroke to the location in the past 30 min */
  nearestKm: number | null
  /** Cloud-to-ground strokes within 10 km in the past 10 min */
  localCg: number
}

export function summarizeStrokes(
  strokes: LightningStroke[],
  at: GeoPoint,
  t: Instant,
): StrokeSummary {
  let recent = 0
  let nearest: number | null = null
  let localCg = 0
  for (const s of strokes) {
    const age = minutesBetween(s.windowEnd, t)
    if (age < 0 || age > 30) continue
    recent++
    const d = haversineKm(at.lat, at.lon, s.lat, s.lon)
    nearest = nearest == null ? d : Math.min(nearest, d)
    if (s.kind === 'cg' && d <= 10 && age <= 10) localCg++
  }
  return { recent, nearestKm: nearest == null ? null : Math.round(nearest), localCg }
}

/**
 * LIGHTNING status (AERIS rule) from LIDEN strokes and the local 雷活動度:
 *   warning   活動度3+ at the location, or cloud-to-ground strokes within 10 km (10 min)
 *   elevated  活動度1+ at the location, or any stroke within 30 km (30 min)
 *   active    strokes somewhere in Japan in the past 30 min
 *   nominal   none
 */
export function lightningStatus(
  sum: StrokeSummary | null,
  localActivity: number | null,
  hasData: boolean,
): SystemReading {
  if (!hasData || !sum) return { status: 'unknown', rule: LIGHTNING_RULE }
  const act = localActivity ?? 0
  const status: SystemStatus =
    act >= 3 || sum.localCg > 0
      ? 'warning'
      : act >= 1 || (sum.nearestKm != null && sum.nearestKm <= 30)
        ? 'elevated'
        : sum.recent > 0
          ? 'active'
          : 'nominal'
  const parts = [`全国 ${sum.recent}回/30分`]
  if (sum.nearestKm != null) parts.push(`最寄り ${sum.nearestKm}km`)
  parts.push(act > 0 ? `監視地点 活動度${act}` : '監視地点 活動なし')
  return { status, headline: parts.join(' · '), rule: LIGHTNING_RULE }
}

/** TORNADO status from the local 竜巻発生確度 (2 → warning, 1 → elevated). */
export function tornadoStatus(localProbability: number | null, hasData: boolean): SystemReading {
  if (!hasData) return { status: 'unknown', rule: TORNADO_RULE }
  const p = localProbability ?? 0
  return {
    status: p >= 2 ? 'warning' : p >= 1 ? 'elevated' : 'nominal',
    headline: p > 0 ? `監視地点 竜巻発生確度${p}` : '監視地点 発生確度なし',
    rule: TORNADO_RULE,
  }
}

// ── Severe weather ──────────────────────────────────────────────────────────

const SEVERE_RULE = 'aeris:severe-weather/v1'

const ALERT_STATUS: Record<AlertSeverity, SystemStatus> = {
  emergency: 'critical',
  danger: 'warning',
  warning: 'elevated',
  advisory: 'active',
}

/**
 * SEVERE WX from JMA statements (AERIS rule): the location's own warnings
 * (特別警報 → CRITICAL, 危険警報 → WARNING, 警報 → ELEVATED), weather
 * information issued for the location's prefecture (線状降水帯 → WARNING,
 * 大雨/台風/暴風… → ELEVATED), and nationwide 線状降水帯 information (ELEVATED).
 */
export function severeStatus(
  alerts: AlertBulletin | undefined,
  info: HazardAssessment[],
  office: string | undefined,
  t: Instant,
  hasData: boolean,
): SystemReading {
  if (!hasData) return { status: 'unknown', rule: SEVERE_RULE }
  const candidates: Array<{ status: SystemStatus; headline: string }> = []
  for (const a of alerts?.alerts ?? [])
    if (a.status !== 'cancelled')
      candidates.push({
        status: ALERT_STATUS[a.severity],
        headline: `${alerts!.areaName} ${a.name}`,
      })
  for (const i of validAt(
    info.filter((x) => x.scheme === 'jma-information' && x.status !== 'cancelled'),
    t,
  )) {
    const local = !!office && i.area.code === office
    const status: SystemStatus =
      local && i.rank >= 3
        ? 'warning'
        : (local && i.rank >= 2) || i.rank >= 3
          ? 'elevated'
          : i.rank >= 2
            ? 'active'
            : 'nominal'
    if (status !== 'nominal') candidates.push({ status, headline: i.level.label })
  }
  const top = candidates.sort(
    (a, b) => SYSTEM_STATUS_RANK[b.status] - SYSTEM_STATUS_RANK[a.status],
  )[0]
  return top
    ? { status: top.status, headline: top.headline, rule: SEVERE_RULE }
    : { status: 'nominal', headline: '顕著な現象の発表なし', rule: SEVERE_RULE }
}

// ── Volcanoes ───────────────────────────────────────────────────────────────

const VOLCANO_RULE = 'aeris:volcano-status/v1'
const VOLCANO_STATUS: SystemStatus[] = [
  'nominal',
  'nominal',
  'active',
  'elevated',
  'warning',
  'critical',
]

/**
 * VOLCANO status from JMA eruption warnings in force (AERIS rule):
 * level 5 → CRITICAL, 4 / residential warning → WARNING, 3 → ELEVATED,
 * 2 / crater-area or sea-area warning → ACTIVE. A volcano within 50 km of the
 * monitoring location with level 3+ is named first.
 */
export function volcanoStatus(
  assessments: HazardAssessment[],
  sites: Array<{ code: string; lat: number; lon: number }>,
  at: GeoPoint,
  hasData: boolean,
): SystemReading {
  if (!hasData) return { status: 'unknown', rule: VOLCANO_RULE }
  const pos = new Map(sites.map((s) => [s.code, s]))
  const near = (a: HazardAssessment) => {
    const s = a.area.code ? pos.get(a.area.code) : undefined
    return !!s && haversineKm(at.lat, at.lon, s.lat, s.lon) <= 50
  }
  const ranked = assessments
    .filter((a) => a.scheme === 'jma-volcano' && a.status !== 'cancelled' && a.rank >= 2)
    .sort((a, b) => b.rank - a.rank || Number(near(b)) - Number(near(a)))
  const top = ranked[0]
  if (!top) return { status: 'nominal', headline: '噴火警報の発表なし', rule: VOLCANO_RULE }
  const cond = top.values?.condition ? ` ${top.values.condition}` : ''
  return {
    status: VOLCANO_STATUS[Math.min(5, top.rank)]!,
    headline: `${top.area.name} ${top.level.label}${cond}${ranked.length > 1 ? ` ほか${ranked.length - 1}火山` : ''}`,
    eventId: top.eventRef,
    rule: VOLCANO_RULE,
  }
}

// ── Hydro / ground (キキクル) ───────────────────────────────────────────────

const HYDRO_RULE = 'aeris:hydro-status/v2'
const GROUND_RULE = 'aeris:ground-status/v1'

/** キキクル 警戒レベル相当 → status (5 → CRITICAL … 2 → ACTIVE). */
function kikikuruStatus(level: number | null): SystemStatus {
  const l = level ?? 0
  return l >= 5
    ? 'critical'
    : l >= 4
      ? 'warning'
      : l >= 3
        ? 'elevated'
        : l >= 2
          ? 'active'
          : 'nominal'
}

const KIKIKURU_WORD: Record<number, string> = { 2: '注意', 3: '警戒', 4: '危険', 5: '災害切迫' }

/**
 * HYDRO: the worse of 洪水キキクル (rivers within ~2 km) and 浸水キキクル at the
 * location (JMA assessments) sets the status. They stand in for river gauge
 * observations, which are not relayed (see the relay-hydro registry entry).
 * Modeled river discharge (GloFAS) only adds context: a forecast peak above
 * twice today's value makes a quiet line ACTIVE, never more.
 */
export function hydroStatus(
  levels: { flood: number | null; inundation: number | null },
  discharge: { today: number | null; peak: number | null } | null,
  hasData: boolean,
): SystemReading {
  if (!hasData) return { status: 'unknown', rule: HYDRO_RULE }
  const flood = levels.flood ?? 0
  const inund = levels.inundation ?? 0
  let status = kikikuruStatus(Math.max(flood, inund))
  const parts: string[] = []
  if (flood >= 2) parts.push(`洪水キキクル ${KIKIKURU_WORD[flood]}`)
  if (inund >= 2) parts.push(`浸水キキクル ${KIKIKURU_WORD[inund]}`)
  if (parts.length === 0) parts.push('洪水・浸水キキクル 危険度なし')
  if (discharge?.today != null) {
    parts.push(`河川流量(MODEL) ${Math.round(discharge.today)}m³/s`)
    if (status === 'nominal' && discharge.peak != null && discharge.peak > 2 * discharge.today)
      status = 'active'
  }
  return { status, headline: parts.join(' · '), rule: HYDRO_RULE }
}

/** GROUND: 土砂キキクル at the location. */
export function groundStatus(landLevel: number | null, hasData: boolean): SystemReading {
  if (!hasData) return { status: 'unknown', rule: GROUND_RULE }
  return {
    status: kikikuruStatus(landLevel),
    headline:
      landLevel && landLevel >= 2
        ? `土砂キキクル ${KIKIKURU_WORD[landLevel]}`
        : '土砂キキクル 危険度なし',
    rule: GROUND_RULE,
  }
}

// ── Environment: air, ocean, snow ───────────────────────────────────────────

/** AIR from the AERIS air index (CAMS model values). */
export function airStatus(index: AirIndex | null, hasData: boolean): SystemReading {
  if (!hasData || !index) return { status: 'unknown', rule: 'aeris:air-index/v1' }
  return {
    status: AIR_STATUS[index.level],
    headline: `AIR QUALITY ${AIR_LEVEL_LABEL[index.level]}${index.driver ? ` · ${index.driver.toUpperCase().replace('_', '.')}` : ''} (MODEL)`,
    rule: index.rule,
  }
}

const OCEAN_RULE = 'aeris:ocean-status/v1'

/** OCEAN from modeled significant wave height at the nearest sea cell. */
export function oceanStatus(
  waveHeightM: number | null,
  sstC: number | null,
  hasData: boolean,
): SystemReading {
  if (!hasData || waveHeightM == null) return { status: 'unknown', rule: OCEAN_RULE }
  const h = waveHeightM
  const status: SystemStatus =
    h >= 6 ? 'warning' : h >= 4 ? 'elevated' : h >= 2.5 ? 'active' : 'nominal'
  const parts = [`波高 ${h.toFixed(1)}m`]
  if (sstC != null) parts.push(`海面水温 ${sstC.toFixed(1)}°C`)
  return { status, headline: `${parts.join(' · ')} (MODEL)`, rule: OCEAN_RULE }
}

const SNOW_RULE = 'aeris:snow-status/v1'

/** SNOW-ICE from JMA's analysed snow depth and 3-hour snowfall at the location. */
export function snowStatus(
  depthCm: number | null,
  snowfall3hCm: number | null,
  hasData: boolean,
): SystemReading {
  if (!hasData) return { status: 'unknown', rule: SNOW_RULE }
  const d = depthCm ?? 0
  const f = snowfall3hCm ?? 0
  const status: SystemStatus =
    f >= 20
      ? 'warning'
      : f >= 10 || d >= 100
        ? 'elevated'
        : f >= 3 || d >= 20
          ? 'active'
          : 'nominal'
  const parts = [depthCm != null ? `積雪 ${depthCm}cm+` : '積雪なし']
  if (snowfall3hCm != null) parts.push(`3時間降雪 ${snowfall3hCm}cm+`)
  return { status, headline: `${parts.join(' · ')} (EST)`, rule: SNOW_RULE }
}

// ── Space weather ───────────────────────────────────────────────────────────

const SPACE_RULE = 'aeris:space-status/v1'
const SCALE_STATUS: SystemStatus[] = [
  'nominal',
  'active',
  'active',
  'elevated',
  'warning',
  'critical',
]

/**
 * SPACE WX from NOAA's current G / S / R scales (their assessment), with the
 * estimated Kp, solar wind and X-ray class as the headline.
 */
export function spaceStatus(
  sw: {
    scales: { current: { G: number; S: number; R: number } }
    kp: { estimated: number | null }
    solarWind: { speed: number | null; bz: number | null }
    xray: { current: string | null }
  } | null,
  hasData: boolean,
): SystemReading {
  if (!hasData || !sw) return { status: 'unknown', rule: SPACE_RULE }
  const { G, S, R } = sw.scales.current
  const top = Math.max(G, S, R)
  let status = SCALE_STATUS[Math.min(5, top)]!
  // Kp 5+ is a G1 storm even before NOAA's scale product updates.
  if (status === 'nominal' && (sw.kp.estimated ?? 0) >= 5) status = 'active'
  const parts: string[] = []
  if (sw.kp.estimated != null) parts.push(`Kp ${sw.kp.estimated.toFixed(1)} (EST)`)
  if (top > 0) parts.push(`G${G} S${S} R${R}`)
  if (sw.solarWind.speed != null) parts.push(`SW ${Math.round(sw.solarWind.speed)}km/s`)
  if (sw.solarWind.bz != null) parts.push(`Bz ${sw.solarWind.bz}nT`)
  if (sw.xray.current) parts.push(`X-ray ${sw.xray.current}`)
  return { status, headline: parts.join(' · '), rule: SPACE_RULE }
}

// ── Global / wildfire ───────────────────────────────────────────────────────

const GLOBAL_RULE = 'aeris:global-status/v1'

/**
 * GLOBAL from GDACS impact assessments in force (Red → WARNING, Orange →
 * ELEVATED) and EONET-tracked events (any open → ACTIVE).
 */
export function globalStatus(
  gdacs: HazardAssessment[],
  events: NaturalEvent[],
  hasData: boolean,
): SystemReading {
  if (!hasData) return { status: 'unknown', rule: GLOBAL_RULE }
  const current = gdacs.filter((a) => a.scheme === 'gdacs' && a.status !== 'cancelled')
  const red = current.filter((a) => a.rank >= 3)
  const orange = current.filter((a) => a.rank === 2)
  const tracked = events.filter(
    (e) => e.sources.some((s) => s.source === 'eonet') && e.lifecycle === 'ongoing',
  )
  const status: SystemStatus = red.length
    ? 'warning'
    : orange.length
      ? 'elevated'
      : tracked.length
        ? 'active'
        : 'nominal'
  const top = red[0] ?? orange[0]
  const parts = [
    `GDACS R${red.length} O${orange.length} G${current.length - red.length - orange.length}`,
    `EONET ${tracked.length} open`,
  ]
  if (top) parts.unshift(top.area.name)
  return { status, headline: parts.join(' · '), eventId: top?.eventRef, rule: GLOBAL_RULE }
}

const FIRE_RULE = 'aeris:wildfire-status/v1'

/**
 * WILDFIRE: an AERIS fire cluster (FIRMS) within 50 km → ELEVATED; any fire
 * cluster or tracked wildfire → ACTIVE. Without FIRMS the line still uses EONET.
 */
export function wildfireStatus(
  fires: NaturalEvent[],
  at: GeoPoint,
  hasData: boolean,
): SystemReading {
  if (!hasData) return { status: 'unknown', rule: FIRE_RULE }
  const clusters = fires.filter(
    (e) =>
      e.category === 'wildfire' &&
      e.derivation === 'derived' &&
      e.sources[0]?.source === 'relay-firms',
  )
  const tracked = fires.filter((e) => e.category === 'wildfire' && e.sources[0]?.source === 'eonet')
  const distance = (e: NaturalEvent) => {
    if (e.geometry.type !== 'Point') return Infinity
    const [lon, lat] = e.geometry.coordinates
    return haversineKm(at.lat, at.lon, lat, lon)
  }
  const near = clusters.filter((e) => distance(e) <= 50)
  const status: SystemStatus = near.length
    ? 'elevated'
    : clusters.length || tracked.length
      ? 'active'
      : 'nominal'
  const parts = [`熱異常クラスタ ${clusters.length}(派生)`, `追跡中 ${tracked.length}(EONET)`]
  if (near.length) parts.unshift('監視地点50km内に熱異常')
  return { status, headline: parts.join(' · '), rule: FIRE_RULE }
}
