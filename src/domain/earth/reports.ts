/**
 * Source-level payloads carried inside SourceObservation<T>. These are what
 * one agency said, normalised to AERIS units but not yet fused.
 */
import type { Instant } from '../time'
import type { HazardAssessment } from './assessments'
import type { SourceObservation } from './common'
import type {
  ActiveFireDetection,
  CycloneDetail,
  IntensityObservation,
  VolcanoSite,
} from './events'
import type { PointSeries, RasterFieldSeries } from './fields'

/** One agency's solution for one earthquake. */
export type QuakeSolution = {
  originTime: Instant
  lat: number
  lon: number
  /** null when the agency gave no depth */
  depthKm: number | null
  magnitude: { value: number; type: string } | null
  areaName?: string
  /** JMA intensity class ('1'..'7', '5-', '5+' …) */
  maxIntensity?: string
  stations?: IntensityObservation[]
  tsunamiFlag?: boolean
  comments?: string[]
  /** Bulletin title, e.g. '震源・震度情報' */
  bulletin?: string
  cancelled?: boolean
  url?: string
}

/** One forecast-area item of a JMA tsunami bulletin. */
export type TsunamiAreaForecast = {
  areaCode: string
  areaName: string
  /** JMA kind code (52/53 大津波警報, 51 警報, 62 注意報, 71–73 予報, 50/60 解除, 00 なし) */
  kindCode: string
  kindName: string
  lastKindCode?: string
  /** Expected maximum height as stated: '<0.2', '1', '3', '5', '10', '>10' */
  maxHeight?: string
  /** Qualitative height ('巨大', '高い') used instead of a number at first */
  maxHeightCondition?: string
  firstArrival?: Instant
  /** e.g. '第１波の到達を確認', 'ただちに津波来襲と予測' */
  firstArrivalCondition?: string
}

export type TsunamiStationObservation = {
  station: string
  areaName?: string
  firstArrival?: Instant
  /** First-wave polarity ('押し' / '引き') */
  initial?: string
  maxHeight?: string
  maxHeightAt?: Instant
  /** e.g. '観測中', '上昇中' */
  condition?: string
}

/** A tsunami bulletin set for one earthquake event, as JMA stated it. */
export type TsunamiReport = {
  eventId: string
  issuedAt: Instant
  title: string
  headline?: string
  /** Head.ValidDateTime — set for forecasts (若干の海面変動) */
  validUntil?: Instant
  cancelled: boolean
  forecasts: TsunamiAreaForecast[]
  observations: TsunamiStationObservation[]
  origin?: { time: Instant; areaName?: string; lat?: number; lon?: number; magnitude?: number }
  comments: string[]
}

// ── Reports moved from the source adapters ──────────────────────────────────
// Normalised payloads (what one agency said). They are hand-written domain
// types, not Zod inferences: each adapter's mapper produces them and the
// compiler checks the mapping.

/** Open-Meteo Air Quality variables (CAMS). */
export const AIR_KEYS = [
  'pm2_5',
  'pm10',
  'ozone',
  'nitrogen_dioxide',
  'sulphur_dioxide',
  'carbon_monoxide',
  'dust',
  'aerosol_optical_depth',
  'uv_index',
] as const
export type AirKey = (typeof AIR_KEYS)[number]

/** Open-Meteo Marine variables. */
export const MARINE_KEYS = [
  'wave_height',
  'wave_direction',
  'wave_period',
  'swell_wave_height',
  'swell_wave_direction',
  'swell_wave_period',
  'sea_surface_temperature',
  'ocean_current_velocity',
  'ocean_current_direction',
  'sea_level_height_msl',
] as const
export type MarineKey = (typeof MARINE_KEYS)[number]

/** Cyclone report as JMA stated it for one issuance. */
export type CycloneReport = {
  id: string
  number?: string
  name?: string
  nameEn?: string
  issuedAt: Instant
  category?: string
  categoryLabel?: string
  intensityClass?: string
  sizeClass?: string
  location?: string
  maxGustMs?: number
  detail: CycloneDetail
}

/** One volcano's latest bulletin as JMA stated it. */
export type VolcanoReport = {
  site: VolcanoSite
  issuedAt: Instant
  levelCode: string
  levelName: string
  lastCode?: string
  condition?: string
  /** 'municipality: response' lines */
  municipalities: string[]
}

export type VolcanoFeed = { sites: VolcanoSite[]; reports: SourceObservation<VolcanoReport>[] }

export type SwpcAlert = {
  id: string
  productId: string
  issuedAt: Instant
  /** 'ALERT' | 'WARNING' | 'WATCH' | 'SUMMARY' | … */
  kind: string
  title: string
  /** NOAA scale named in the message, e.g. 'G1' */
  scale?: string
}

export type SpaceWeather = {
  solarWind: { speed: number | null; bt: number | null; bz: number | null; at: Instant | null }
  /** Propagated L1 solar wind, past hour (speed km/s, bz nT) */
  windSeries: Array<{ t: Instant; speed: number | null; bz: number | null }>
  kp: {
    /** 1-minute estimate (EST) */
    estimated: number | null
    estimatedAt: Instant | null
    /** 3-hourly planetary Kp (observed, may be provisional) */
    series: Array<{ t: Instant; kp: number }>
  }
  xray: {
    current: string | null
    at: Instant | null
    maxClass: string | null
    maxAt: Instant | null
  }
  /** NOAA scales: current (index 0) and predicted days (1–3) */
  scales: {
    current: { G: number; S: number; R: number }
    predicted: Array<{
      date: string
      G: number | null
      rMinorProb: number | null
      sProb: number | null
    }>
    at: Instant | null
  }
  alerts: SwpcAlert[]
}

export type AuroraGrid = {
  observedAt: Instant
  forecastFor: Instant
  /** [lon in -180..180, lat, probability %] for cells with probability ≥ minProb */
  cells: Array<[number, number, number]>
}

export type EonetPoint = {
  at: Instant
  lat: number
  lon: number
  magnitude?: { value: number; unit: string }
}

export type EonetEvent = {
  id: string
  title: string
  description?: string
  link?: string
  category: string
  categoryTitle: string
  /** Agencies that reported it (EONET does not observe by itself) */
  reporters: string[]
  closedAt?: Instant
  /** Dated positions; polygons are reduced to their first vertex */
  track: EonetPoint[]
}

export type GdacsAssessment = HazardAssessment & {
  values: { eventtype: string; lat: number; lon: number; severity?: string; report?: string }
}

export type AirQuality = {
  at: Instant
  current: Partial<Record<AirKey, number | null>>
  units: Partial<Record<AirKey, string>>
  /** Hourly PM2.5 / dust: past day as analysis, then forecast */
  series: PointSeries<'pm2_5' | 'dust'>
}

export type MarineState = {
  at: Instant
  /** Distance from the monitoring location to the model sea cell */
  cellDistanceKm: number
  current: Partial<Record<MarineKey, number | null>>
  series: PointSeries<'wave_height' | 'sst' | 'sea_level'>
}

export type MarineCell = {
  lat: number
  lon: number
  wave: number
  dir: number | null
  sst: number | null
}
export type MarineGrid = { at: Instant; cells: MarineCell[] }

export type KikikuruSeries = {
  land: RasterFieldSeries
  inundation: RasterFieldSeries
  /** 洪水キキクル: vector tiles (.pbf, source-layer 'flood', property 'level') */
  flood: RasterFieldSeries
}

export type SnowSeries = { depth: RasterFieldSeries; snowfall: RasterFieldSeries }

export type DischargeKey = 'discharge' | 'median' | 'max' | 'p75'

/** NOAA NHC storm as relayed (one active system). */
export type NhcStorm = {
  id: string
  name: string
  classification: string
  intensityKt: number | null
  pressureMb: number | null
  lat: number
  lon: number
  movementDir: number | null
  movementSpeedKt: number | null
  lastUpdate: string
}
export type NhcFeed = { fetchedAt: Instant; storms: NhcStorm[] }

export type FirmsFeed = { fetchedAt: Instant; total: number; detections: ActiveFireDetection[] }

/** Ordinal of a JMA tsunami kind: 4 大津波警報 … 1 予報, 0 none / cleared. */
export function tsunamiKindRank(code: string): number {
  if (code === '52' || code === '53') return 4
  if (code === '51') return 3
  if (code === '62') return 2
  if (code === '71' || code === '72' || code === '73') return 1
  return 0
}

/** JMA code → AERIS rank (eruption alert level codes map to their level). */
export function volcanoRank(code: string): number {
  const n = Number(code)
  if (n >= 11 && n <= 15) return n - 10
  if (code === '21') return 4 // 噴火警報(居住地域)
  if (code === '22' || code === '36') return 2 // 火口周辺 / 周辺海域
  return 1
}

export function alertLevelOf(code: string): number | undefined {
  const n = Number(code)
  return n >= 11 && n <= 15 ? n - 10 : undefined
}
