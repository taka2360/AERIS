/**
 * AERIS unified weather data model.
 * UI depends only on these types — never on an external API's JSON shape.
 * Every value carries provenance: where it came from and what kind of data it is.
 */
import type { Instant } from './time'

export type SourceId =
  | 'jma-amedas'
  | 'jma-forecast'
  | 'jma-warning'
  | 'jma-nowcast'
  | 'jma-area'
  | 'openmeteo'
  | 'openmeteo-geocoder'
  | 'gsi-geocoder'
  | 'gsi-search'
  | 'basemap'
  | 'mock'

/** observation = measured; model = NWP analysis; forecast = future; official = issued by an authority */
export type DataKind = 'observation' | 'model' | 'forecast' | 'official'

export type Provenance = {
  source: SourceId
  kind: DataKind
  /** Human-readable origin, e.g. 'AMeDAS 東京' or 'JMA MSM' */
  label?: string
  observedAt?: Instant
  issuedAt?: Instant
  validFrom?: Instant
  validTo?: Instant
  retrievedAt: Instant
  /** Distance from the target location to the observing station */
  distanceKm?: number
}

export type Sourced<T> = { value: T; provenance: Provenance }

export type WeatherCondition =
  | 'clear'
  | 'mostly-clear'
  | 'partly-cloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'showers'
  | 'sleet'
  | 'snow'
  | 'heavy-snow'
  | 'thunder'
  | 'unknown'

export type WeatherLocation = {
  lat: number
  lon: number
  /** Display name, e.g. '東京都千代田区' */
  name: string
  /** Sub-area name, e.g. '皇居外苑' */
  subName?: string
  /** 5-digit municipality code (JIS X 0402) */
  muniCode?: string
  /** JMA forecast-area codes */
  jma?: { office: string; class10: string; class20: string; officeName?: string }
  origin: 'gps' | 'manual' | 'default'
}

/** Current conditions. Each field may come from a different source. */
export type CurrentConditions = {
  condition?: Sourced<WeatherCondition>
  temperature?: Sourced<number> // °C
  apparentTemperature?: Sourced<number> // °C
  humidity?: Sourced<number> // %
  dewPoint?: Sourced<number> // °C
  pressure?: Sourced<number> // hPa (sea level)
  precipitation1h?: Sourced<number> // mm
  windSpeed?: Sourced<number> // m/s
  windDirection?: Sourced<number> // degrees, direction wind blows FROM
  gust?: Sourced<number> // m/s
  cloudCover?: Sourced<number> // %
  visibility?: Sourced<number> // km
  uvIndex?: Sourced<number>
  sunshine1h?: Sourced<number> // minutes within past hour
}

export type CurrentField = keyof CurrentConditions

export type HourlyPoint = {
  time: Instant
  temperature: number | null
  apparentTemperature: number | null
  humidity: number | null
  dewPoint: number | null
  pressure: number | null
  precipitation: number | null // mm/h
  precipitationProbability: number | null // %
  windSpeed: number | null
  windDirection: number | null
  gust: number | null
  cloudCover: number | null
  visibility: number | null // km
  uvIndex: number | null
  condition: WeatherCondition
}

/**
 * Hourly series spanning past and future. Points before `provenance.validFrom`
 * (or `now`) are analysis/past values; later points are forecast.
 */
export type HourlySeries = {
  points: HourlyPoint[]
  provenance: Provenance
}

export type DailyPoint = {
  date: string // YYYY-MM-DD (JST)
  condition: WeatherCondition
  tempMax: number | null
  tempMin: number | null
  precipitationSum: number | null
  precipitationProbability: number | null
  windSpeedMax: number | null
  gustMax: number | null
  windDirectionDominant: number | null
  uvIndexMax: number | null
  sunrise: Instant | null
  sunset: Instant | null
}

export type DailySeries = {
  days: DailyPoint[]
  provenance: Provenance
}

/** Official forecast text issued by JMA for the forecast area */
export type OfficialForecast = {
  areaName: string
  /** e.g. 'くもり 時々 雨' */
  weather: string
  wind?: string
  wave?: string
  provenance: Provenance
}

/** JMA warning severity (new system from 2026-05-28) */
export type AlertSeverity = 'advisory' | 'warning' | 'danger' | 'emergency'

export type WeatherAlert = {
  id: string
  /** e.g. '大雨', '強風' */
  phenomenon: string
  /** Official name, e.g. 'レベル3大雨警報' */
  name: string
  severity: AlertSeverity
  /** Evacuation-related alert level 2–5, when applicable */
  level?: number
  status: 'issued' | 'continued' | 'cancelled'
}

export type AlertBulletin = {
  areaName: string
  headline?: string
  alerts: WeatherAlert[]
  provenance: Provenance
}

/** A nearby AMeDAS station reading for the spatial scope */
export type StationObservation = {
  id: string
  name: string
  lat: number
  lon: number
  distanceKm: number
  observedAt: Instant
  temperature: number | null
  humidity: number | null
  pressure: number | null // hPa, sea level
  precipitation1h: number | null
  windSpeed: number | null
  windDirection: number | null
  gust: number | null
  sunshine1h: number | null // minutes (0–60)
  visibility: number | null // km
}

export type NowcastFrame = {
  validTime: Instant
  kind: 'observation' | 'forecast'
  /** XYZ tile URL template with {z}/{x}/{y} */
  tileUrlTemplate: string
}

/** Wind vector sample at a grid point, for map rendering */
export type WindSample = { lat: number; lon: number; speed: number; direction: number }

export type GeoPoint = { lat: number; lon: number }

/** Output of a numerical model source: model "current" plus hourly/daily series. */
export type ModelForecast = {
  current: CurrentConditions
  hourly: HourlySeries
  daily: DailySeries
}

export type PlaceCandidate = {
  name: string
  admin?: string
  lat: number
  lon: number
}
