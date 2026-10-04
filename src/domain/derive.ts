/**
 * Pure derivations on the domain model. No I/O, no framework.
 */
import type { CurrentConditions, HourlyPoint, WeatherCondition } from './model'
import { epoch, type Instant } from './time'

// ─── Compass ────────────────────────────────────────────────────────────────

const COMPASS_16 = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const

export function compass16(degrees: number): string {
  const idx = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16
  return COMPASS_16[idx] ?? 'N'
}

// ─── Weather condition labels ───────────────────────────────────────────────

/** Short terminal code + Japanese label for each condition. */
export const CONDITION_LABEL: Record<WeatherCondition, { code: string; ja: string }> = {
  clear: { code: 'CLR', ja: '快晴' },
  'mostly-clear': { code: 'FEW', ja: '晴れ' },
  'partly-cloudy': { code: 'SCT', ja: '晴れ時々くもり' },
  overcast: { code: 'OVC', ja: 'くもり' },
  fog: { code: 'FG', ja: '霧' },
  drizzle: { code: 'DZ', ja: '霧雨' },
  rain: { code: 'RA', ja: '雨' },
  'heavy-rain': { code: '+RA', ja: '強い雨' },
  showers: { code: 'SHRA', ja: 'にわか雨' },
  sleet: { code: 'RASN', ja: 'みぞれ' },
  snow: { code: 'SN', ja: '雪' },
  'heavy-snow': { code: '+SN', ja: '大雪' },
  thunder: { code: 'TS', ja: '雷雨' },
  unknown: { code: '---', ja: '不明' },
}

// ─── Pressure tendency ──────────────────────────────────────────────────────

export type PressureTendency = {
  trend: 'rising' | 'falling' | 'steady'
  /** hPa change over the window */
  delta: number
  windowHours: number
}

/** Pressure change over the past `windowHours`, from an hourly series. */
export function pressureTendency(
  points: HourlyPoint[],
  now: Instant,
  windowHours = 3,
): PressureTendency | null {
  const t = epoch(now)
  const past = points.filter((p) => epoch(p.time) <= t && p.pressure != null)
  const latest = past.at(-1)
  if (!latest || latest.pressure == null) return null
  const target = epoch(latest.time) - windowHours * 3_600_000
  const base = past.find((p) => epoch(p.time) >= target)
  if (!base || base.pressure == null || base === latest) return null
  const delta = Math.round((latest.pressure - base.pressure) * 10) / 10
  const trend = delta >= 1 ? 'rising' : delta <= -1 ? 'falling' : 'steady'
  return { trend, delta, windowHours }
}

// ─── AERIS status (independent of official JMA warnings) ───────────────────

export type AerisStatusLevel = 'nominal' | 'caution' | 'alert'

export type AerisReasonCode =
  | 'HIGH_GUST'
  | 'HIGH_WIND'
  | 'HEAVY_PRECIP'
  | 'PRECIP_INBOUND'
  | 'LOW_VISIBILITY'
  | 'HEAT'
  | 'COLD'
  | 'PRESSURE_DROP'
  | 'HIGH_UV'

export type AerisReason = {
  code: AerisReasonCode
  level: Exclude<AerisStatusLevel, 'nominal'>
  value: number
  threshold: number
  unit: string
}

export type AerisStatus = { level: AerisStatusLevel; reasons: AerisReason[] }

type Rule = {
  code: AerisReasonCode
  unit: string
  caution: number
  alert: number
  /** 'above' triggers when value >= threshold, 'below' when value <= threshold */
  dir: 'above' | 'below'
}

/** Thresholds are AERIS heuristics, deliberately conservative. Not official criteria. */
export const AERIS_RULES: Record<AerisReasonCode, Rule> = {
  HIGH_GUST: { code: 'HIGH_GUST', unit: 'm/s', caution: 15, alert: 25, dir: 'above' },
  HIGH_WIND: { code: 'HIGH_WIND', unit: 'm/s', caution: 10, alert: 20, dir: 'above' },
  HEAVY_PRECIP: { code: 'HEAVY_PRECIP', unit: 'mm/h', caution: 10, alert: 30, dir: 'above' },
  PRECIP_INBOUND: { code: 'PRECIP_INBOUND', unit: 'mm/h', caution: 10, alert: 30, dir: 'above' },
  LOW_VISIBILITY: { code: 'LOW_VISIBILITY', unit: 'km', caution: 2, alert: 0.5, dir: 'below' },
  HEAT: { code: 'HEAT', unit: '°C', caution: 31, alert: 35, dir: 'above' },
  COLD: { code: 'COLD', unit: '°C', caution: -5, alert: -10, dir: 'below' },
  PRESSURE_DROP: { code: 'PRESSURE_DROP', unit: 'hPa/3h', caution: -3, alert: -6, dir: 'below' },
  HIGH_UV: { code: 'HIGH_UV', unit: '', caution: 8, alert: 11, dir: 'above' },
}

function evaluate(rule: Rule, value: number | undefined | null): AerisReason | null {
  if (value == null || Number.isNaN(value)) return null
  const hit = (t: number) => (rule.dir === 'above' ? value >= t : value <= t)
  if (hit(rule.alert))
    return { code: rule.code, level: 'alert', value, threshold: rule.alert, unit: rule.unit }
  if (hit(rule.caution))
    return { code: rule.code, level: 'caution', value, threshold: rule.caution, unit: rule.unit }
  return null
}

export function deriveAerisStatus(input: {
  current: CurrentConditions
  hourly: HourlyPoint[]
  now: Instant
}): AerisStatus {
  const { current, hourly, now } = input
  const t = epoch(now)
  const next3h = hourly.filter((p) => {
    const dt = epoch(p.time) - t
    return dt > 0 && dt <= 3 * 3_600_000
  })
  const inboundPrecip = next3h.reduce<number | null>(
    (m, p) => (p.precipitation == null ? m : Math.max(m ?? 0, p.precipitation)),
    null,
  )
  const tendency = pressureTendency(hourly, now)
  const heatIndex = current.apparentTemperature?.value ?? current.temperature?.value

  const candidates = [
    evaluate(AERIS_RULES.HIGH_GUST, current.gust?.value),
    evaluate(AERIS_RULES.HIGH_WIND, current.windSpeed?.value),
    evaluate(AERIS_RULES.HEAVY_PRECIP, current.precipitation1h?.value),
    evaluate(AERIS_RULES.PRECIP_INBOUND, inboundPrecip),
    evaluate(AERIS_RULES.LOW_VISIBILITY, current.visibility?.value),
    evaluate(AERIS_RULES.HEAT, heatIndex),
    evaluate(AERIS_RULES.COLD, current.temperature?.value),
    evaluate(AERIS_RULES.PRESSURE_DROP, tendency?.delta),
    evaluate(AERIS_RULES.HIGH_UV, current.uvIndex?.value),
  ]
  const reasons = candidates
    .filter((r): r is AerisReason => r !== null)
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'alert' ? -1 : 1))
  const level: AerisStatusLevel = reasons.some((r) => r.level === 'alert')
    ? 'alert'
    : reasons.length > 0
      ? 'caution'
      : 'nominal'
  return { level, reasons }
}

// ─── Misc ───────────────────────────────────────────────────────────────────

/** Magnus formula dew point (°C). */
export function dewPointC(tempC: number, rh: number): number {
  const a = 17.62
  const b = 243.12
  const g = Math.log(Math.max(rh, 1) / 100) + (a * tempC) / (b + tempC)
  return Math.round(((b * g) / (a - g)) * 10) / 10
}

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Format coordinates as '35.681N 139.767E'. */
export function formatCoord(lat: number, lon: number, digits = 3): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(digits)}${ns} ${Math.abs(lon).toFixed(digits)}${ew}`
}
