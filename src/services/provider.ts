/**
 * WeatherProvider — the seam between data sources and the rest of the app.
 * A provider bundles source adapters; the app can run on the mock provider
 * (development, tests, visual regression) or the live provider.
 */
import type {
  AlertBulletin,
  CurrentConditions,
  DailySeries,
  HourlySeries,
  NowcastFrame,
  OfficialForecast,
  StationObservation,
  WeatherLocation,
  WindSample,
} from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import type { Instant } from '@/domain/time'

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

export interface WeatherProvider {
  readonly id: 'mock' | 'live'
  /** Clock used to interpret data (mock may pin it for reproducible screenshots) */
  now(): Instant
  forecast(point: GeoPoint, signal?: AbortSignal): Promise<SourceResult<ModelForecast>>
  stations(point: GeoPoint, signal?: AbortSignal): Promise<SourceResult<StationObservation[]>>
  alerts(location: WeatherLocation, signal?: AbortSignal): Promise<SourceResult<AlertBulletin>>
  officialForecast(
    location: WeatherLocation,
    signal?: AbortSignal,
  ): Promise<SourceResult<OfficialForecast>>
  nowcastFrames(signal?: AbortSignal): Promise<SourceResult<NowcastFrame[]>>
  windField(point: GeoPoint, signal?: AbortSignal): Promise<SourceResult<WindSample[]>>
  resolveLocation(
    point: GeoPoint & { origin: WeatherLocation['origin'] },
    signal?: AbortSignal,
  ): Promise<SourceResult<WeatherLocation>>
  searchPlaces(query: string, signal?: AbortSignal): Promise<SourceResult<PlaceCandidate[]>>
}

/** Round coordinates to 0.01° (~1 km) for query keys and outbound requests. */
export function roundPoint(p: GeoPoint): GeoPoint {
  return { lat: Math.round(p.lat * 100) / 100, lon: Math.round(p.lon * 100) / 100 }
}
