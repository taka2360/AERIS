/**
 * Deterministic synthetic weather for development, tests and visual regression.
 * Produces a plausible scenario: a fair afternoon followed by an approaching
 * rain band with falling pressure and strengthening wind.
 */
import { dewPointC, haversineKm } from '@/domain/derive'
import type {
  AlertBulletin,
  CurrentConditions,
  DailyPoint,
  HourlyPoint,
  NowcastFrame,
  OfficialForecast,
  Provenance,
  StationObservation,
  WeatherCondition,
  WindGridTier,
  WindSample,
} from '@/domain/model'
import { windGridPoints } from '@/domain/model'
import {
  addMinutes,
  epoch,
  jstDateKey,
  jstParts,
  startOfHour,
  toInstant,
  type Instant,
} from '@/domain/time'

/** Small deterministic PRNG so the same hour always yields the same noise. */
function noise(seed: number): number {
  let x = (seed ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x / 0xffffffff - 0.5
}

const round1 = (v: number) => Math.round(v * 10) / 10
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Hours from `now` at which the synthetic rain band peaks. */
const RAIN_PEAK_H = 9
const RAIN_HALF_WIDTH_H = 3.5

function rainIntensity(hoursFromNow: number): number {
  const d = (hoursFromNow - RAIN_PEAK_H) / RAIN_HALF_WIDTH_H
  return Math.max(0, Math.exp(-d * d) * 7.5 - 0.25)
}

function conditionFor(precip: number, cloud: number, isThunder: boolean): WeatherCondition {
  if (isThunder) return 'thunder'
  if (precip >= 4) return 'heavy-rain'
  if (precip >= 0.5) return 'rain'
  if (precip > 0.05) return 'drizzle'
  if (cloud >= 85) return 'overcast'
  if (cloud >= 45) return 'partly-cloudy'
  if (cloud >= 15) return 'mostly-clear'
  return 'clear'
}

export function synthHourly(now: Instant, pastHours = 24, futureHours = 168): HourlyPoint[] {
  const start = epoch(startOfHour(now)) - pastHours * 3_600_000
  const nowMs = epoch(now)
  const points: HourlyPoint[] = []
  for (let i = 0; i <= pastHours + futureHours; i++) {
    const ms = start + i * 3_600_000
    const time = toInstant(ms)
    const h = (ms - nowMs) / 3_600_000
    const hour = jstParts(time).hour
    const seed = Math.floor(ms / 3_600_000)
    const rain = rainIntensity(h) + (h > 60 && h < 75 ? Math.max(0, Math.sin((h - 60) / 4) * 2) : 0)
    const diurnal = Math.sin(((hour - 8) / 24) * Math.PI * 2)
    const rainCooling = Math.min(4, rain * 0.6)
    const temperature = round1(21.5 + 4.2 * diurnal - rainCooling - h * 0.01 + noise(seed) * 0.6)
    const humidity = Math.round(clamp(62 - diurnal * 14 + rain * 6 + noise(seed + 1) * 4, 25, 99))
    const pressure = round1(
      1012.4 -
        7.5 * Math.exp(-(((h - RAIN_PEAK_H - 1) / 7) ** 2)) +
        h * 0.02 +
        noise(seed + 2) * 0.3,
    )
    const windSpeed = round1(
      clamp(
        3.2 +
          5.8 * Math.exp(-(((h - RAIN_PEAK_H - 1.5) / 5) ** 2)) +
          diurnal * 0.8 +
          noise(seed + 3),
        0.3,
        30,
      ),
    )
    const windDirection = Math.round(
      (40 + (h > RAIN_PEAK_H ? 140 : h * 8) + noise(seed + 4) * 30 + 360) % 360,
    )
    const cloudCover = Math.round(
      clamp(35 + rain * 25 + (h > 3 ? 30 : 0) + noise(seed + 5) * 20, 0, 100),
    )
    const precipitation = round1(Math.max(0, rain))
    const isThunder = precipitation >= 5.5
    const dayLight = hour >= 6 && hour <= 17
    const uvRaw = dayLight ? Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI) * 6.5) : 0
    points.push({
      time,
      temperature,
      apparentTemperature: round1(temperature + (humidity - 50) * 0.04 - windSpeed * 0.25),
      humidity,
      dewPoint: dewPointC(temperature, humidity),
      pressure,
      precipitation,
      precipitationProbability:
        Math.round(clamp(rain * 14 + cloudCover * 0.15 - 5, 0, 95) / 10) * 10,
      windSpeed,
      windDirection,
      gust: round1(windSpeed * (1.55 + noise(seed + 6) * 0.2)),
      cloudCover,
      visibility: round1(clamp(24 - rain * 2.6 - (humidity > 92 ? 6 : 0), 0.4, 30)),
      uvIndex: round1(uvRaw * (1 - cloudCover / 160)),
      condition: conditionFor(precipitation, cloudCover, isThunder),
    })
  }
  return points
}

export function synthDaily(hourly: HourlyPoint[], now: Instant): DailyPoint[] {
  const today = jstDateKey(now)
  const groups = new Map<string, HourlyPoint[]>()
  for (const p of hourly) {
    const key = jstDateKey(p.time)
    if (key < today) continue
    const list = groups.get(key) ?? []
    list.push(p)
    groups.set(key, list)
  }
  const days: DailyPoint[] = []
  for (const [date, pts] of groups) {
    if (pts.length < 12) continue
    const nums = (k: keyof HourlyPoint) =>
      pts.map((p) => p[k]).filter((v): v is number => typeof v === 'number')
    const precip = nums('precipitation')
    const wettest = pts.reduce((a, b) => ((b.precipitation ?? 0) > (a.precipitation ?? 0) ? b : a))
    const midday = pts.find((p) => jstParts(p.time).hour === 12) ?? pts[0]!
    const precipSum = round1(precip.reduce((a, b) => a + b, 0))
    days.push({
      date,
      condition: precipSum >= 1 ? wettest.condition : midday.condition,
      tempMax: Math.max(...nums('temperature')),
      tempMin: Math.min(...nums('temperature')),
      precipitationSum: precipSum,
      precipitationProbability: Math.max(...nums('precipitationProbability')),
      windSpeedMax: Math.max(...nums('windSpeed')),
      gustMax: Math.max(...nums('gust')),
      windDirectionDominant: midday.windDirection,
      uvIndexMax: Math.max(...nums('uvIndex')),
      sunrise: `${date}T05:${String(38 + days.length).padStart(2, '0')}:00+09:00`,
      sunset: `${date}T17:${String(22 - days.length).padStart(2, '0')}:00+09:00`,
    })
  }
  return days.slice(0, 7)
}

export function modelCurrentFrom(
  hourly: HourlyPoint[],
  now: Instant,
  prov: Provenance,
): CurrentConditions {
  const t = epoch(now)
  const p = hourly.reduce((best, x) =>
    Math.abs(epoch(x.time) - t) < Math.abs(epoch(best.time) - t) ? x : best,
  )
  const s = <T>(value: T | null) => (value == null ? undefined : { value, provenance: prov })
  return {
    condition: s(p.condition),
    temperature: s(p.temperature),
    apparentTemperature: s(p.apparentTemperature),
    humidity: s(p.humidity),
    dewPoint: s(p.dewPoint),
    pressure: s(p.pressure),
    precipitation1h: s(p.precipitation),
    windSpeed: s(p.windSpeed),
    windDirection: s(p.windDirection),
    gust: s(p.gust),
    cloudCover: s(p.cloudCover),
    visibility: s(p.visibility),
    uvIndex: s(p.uvIndex),
  }
}

/** Station offsets (km east, km north) relative to the target; names are illustrative. */
const STATIONS: Array<{ id: string; name: string; dx: number; dy: number; full: boolean }> = [
  { id: '44132', name: '東京', dx: -1.5, dy: 1.2, full: true },
  { id: '44136', name: '練馬', dx: -9.4, dy: 6.0, full: false },
  { id: '44116', name: '世田谷', dx: -12.6, dy: -7.4, full: false },
  { id: '44166', name: '羽田', dx: 1.2, dy: -14.3, full: true },
  { id: '44171', name: '江戸川臨海', dx: 8.8, dy: -4.8, full: false },
  { id: '44056', name: '府中', dx: -25.0, dy: 0.1, full: false },
  { id: '46106', name: '横浜', dx: -10.6, dy: -26.9, full: true },
  { id: '45212', name: '千葉', dx: 30.6, dy: -8.9, full: true },
  { id: '43241', name: 'さいたま', dx: -16.4, dy: 21.6, full: false },
  { id: '43286', name: '越谷', dx: 6.9, dy: 22.5, full: false },
  { id: '45401', name: '船橋', dx: 17.6, dy: 2.4, full: false },
  { id: '44046', name: '八王子', dx: -42.5, dy: -0.9, full: false },
]

export function synthStations(
  lat: number,
  lon: number,
  hourly: HourlyPoint[],
  now: Instant,
): StationObservation[] {
  const observedAt = toInstant(epoch(now) - (epoch(now) % 600_000)) // 10-minute cadence
  const base = modelCurrentFrom(hourly, now, {
    source: 'mock',
    kind: 'observation',
    retrievedAt: now,
  })
  const kmPerDegLat = 111.32
  const kmPerDegLon = 111.32 * Math.cos((lat * Math.PI) / 180)
  return STATIONS.map((s, i) => {
    const sLat = lat + s.dy / kmPerDegLat
    const sLon = lon + s.dx / kmPerDegLon
    const n = (k: number) => noise(i * 97 + k + Math.floor(epoch(observedAt) / 600_000))
    // Rain band arrives from the south-west: stations there get rain first.
    const lead = (-s.dx - s.dy) / 40
    const rain = round1(Math.max(0, rainIntensity(-lead * 3) * 0.9 + n(1) * 0.2))
    const temp = (base.temperature?.value ?? 20) + n(2) * 1.2 - s.dy * 0.01
    return {
      id: s.id,
      name: s.name,
      lat: sLat,
      lon: sLon,
      distanceKm: round1(haversineKm(lat, lon, sLat, sLon)),
      observedAt,
      temperature: round1(temp),
      humidity: s.full ? Math.round((base.humidity?.value ?? 60) + n(3) * 6) : null,
      pressure: s.full ? round1((base.pressure?.value ?? 1010) + n(4) * 0.6) : null,
      precipitation1h: rain,
      windSpeed: round1(Math.max(0, (base.windSpeed?.value ?? 3) + n(5) * 2)),
      windDirection: Math.round(((base.windDirection?.value ?? 45) + n(6) * 40 + 360) % 360),
      gust: round1(Math.max(0, (base.gust?.value ?? 5) + n(7) * 2.5)),
      sunshine1h: Math.round(clamp(30 - rain * 20 + n(8) * 30, 0, 60)),
      visibility: s.full ? round1((base.visibility?.value ?? 20) + n(9) * 3) : null,
    }
  }).sort((a, b) => a.distanceKm - b.distanceKm)
}

export function synthWindField(lat: number, lon: number, now: Instant): WindSample[] {
  const samples: WindSample[] = []
  const t = epoch(now) / 3_600_000
  for (let iy = -3; iy <= 3; iy++) {
    for (let ix = -3; ix <= 3; ix++) {
      const sLat = lat + iy * 0.12
      const sLon = lon + ix * 0.15
      // A weak cyclonic swirl centred to the south-west.
      const cx = ix + 4
      const cy = iy + 4
      const ang = (Math.atan2(cy, cx) * 180) / Math.PI
      samples.push({
        lat: sLat,
        lon: sLon,
        speed: round1(3 + Math.hypot(cx, cy) * 0.5 + noise(ix * 13 + iy * 7 + Math.floor(t)) * 1.5),
        direction: Math.round((ang + 180 + 90 + 360) % 360),
      })
    }
  }
  return samples
}

/**
 * Coarse grid wind: westerlies in mid-latitudes, trade winds in the tropics,
 * polar easterlies, with a slow wave so the field is not uniform.
 */
export function synthWindGrid(tier: WindGridTier, now: Instant): WindSample[] {
  const t = epoch(now) / 3_600_000
  return windGridPoints(tier).map((p, k) => {
    const a = Math.abs(p.lat)
    // Direction the wind blows FROM (meteorological).
    const base = a < 30 ? (p.lat >= 0 ? 60 : 120) : a < 60 ? (p.lat >= 0 ? 260 : 280) : 90
    const wave = Math.sin((p.lon + t * 2) / 25) * 35 + Math.cos(p.lat / 9) * 15
    return {
      lat: p.lat,
      lon: p.lon,
      speed: round1(4 + (a >= 30 && a < 60 ? 5 : 1) + noise(k * 17 + Math.floor(t)) * 3),
      direction: Math.round((base + wave + 360) % 360),
      major: p.major,
    }
  })
}

export function synthAlerts(now: Instant, prov: Provenance): AlertBulletin {
  return {
    areaName: '東京地方',
    headline: '東京地方では、今夜遅くまで落雷や急な強い雨に注意してください。',
    alerts: [
      { id: 'thunder', phenomenon: '雷', name: '雷注意報', severity: 'advisory', status: 'issued' },
      {
        id: 'heavy-rain',
        phenomenon: '大雨',
        name: 'レベル2大雨注意報',
        severity: 'advisory',
        level: 2,
        status: 'issued',
      },
    ],
    provenance: { ...prov, issuedAt: addMinutes(startOfHour(now), -44) },
  }
}

export function synthOfficialForecast(now: Instant, prov: Provenance): OfficialForecast {
  return {
    areaName: '東京地方',
    weather: 'くもり　夜　雨　所により　雷を伴い　激しく　降る',
    wind: '北の風　後　南の風　やや強く',
    wave: '０．５メートル　後　１メートル',
    provenance: { ...prov, issuedAt: addMinutes(startOfHour(now), -284) },
  }
}

export function synthNowcastFrames(now: Instant): NowcastFrame[] {
  const base = epoch(now) - (epoch(now) % 300_000)
  const frames: NowcastFrame[] = []
  for (let i = -12; i <= 12; i++) {
    frames.push({
      validTime: toInstant(base + i * 300_000),
      kind: i <= 0 ? 'observation' : 'forecast',
      tileUrlTemplate: '',
    })
  }
  return frames
}
