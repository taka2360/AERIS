/**
 * Open-Meteo → domain. Uses the `best_match` model: for Japan it is driven by
 * JMA MSM/GSM and fills variables JMA models lack (gusts, visibility, UV, PoP).
 */
import type {
  CurrentConditions,
  DailyPoint,
  ExtendedDaily,
  HourlyPoint,
  ModelForecast,
  Provenance,
  WeatherCondition,
} from '@/domain/model'
import { jstDateKey, type Instant } from '@/domain/time'
import type { ExtendedDailyResponse, ForecastResponse } from './schema'

export const MODEL_LABEL = 'OPEN-METEO · JMA BLEND'

/** WMO weather interpretation codes → domain condition. */
export function wmoToCondition(code: number | null): WeatherCondition {
  if (code == null) return 'unknown'
  if (code === 0) return 'clear'
  if (code === 1) return 'mostly-clear'
  if (code === 2) return 'partly-cloudy'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code === 61 || code === 63 || code === 66) return 'rain'
  if (code === 65 || code === 67) return 'heavy-rain'
  if (code === 71 || code === 73 || code === 77) return 'snow'
  if (code === 75 || code === 86) return 'heavy-snow'
  if (code === 85) return 'snow'
  if (code >= 80 && code <= 82) return 'showers'
  if (code >= 95) return 'thunder'
  return 'unknown'
}

/** Open-Meteo returns local wall-clock times; attach the response's UTC offset. */
export function localToInstant(local: string, offsetSeconds: number): Instant {
  const sign = offsetSeconds >= 0 ? '+' : '-'
  const abs = Math.abs(offsetSeconds)
  const hh = String(Math.floor(abs / 3600)).padStart(2, '0')
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, '0')
  const withSeconds = local.length === 16 ? `${local}:00` : local
  return `${withSeconds}${sign}${hh}:${mm}`
}

const km = (m: number | null | undefined) => (m == null ? null : Math.round(m / 100) / 10)

export function adaptForecast(r: ForecastResponse, retrievedAt: Instant): ModelForecast {
  const off = r.utc_offset_seconds
  const at = (local: string) => localToInstant(local, off)
  const currentTime = at(r.current.time)

  const prov: Provenance = {
    source: 'openmeteo',
    kind: 'model',
    label: MODEL_LABEL,
    observedAt: currentTime,
    retrievedAt,
  }
  const c = r.current
  const s = <T>(value: T | null | undefined) =>
    value == null ? undefined : { value, provenance: prov }
  const current: CurrentConditions = {
    condition: s(wmoToCondition(c.weather_code)),
    temperature: s(c.temperature_2m),
    apparentTemperature: s(c.apparent_temperature),
    humidity: s(c.relative_humidity_2m),
    dewPoint: s(c.dew_point_2m),
    pressure: s(c.pressure_msl),
    precipitation1h: s(c.precipitation),
    windSpeed: s(c.wind_speed_10m),
    windDirection: s(c.wind_direction_10m),
    gust: s(c.wind_gusts_10m),
    cloudCover: s(c.cloud_cover),
    visibility: s(km(c.visibility)),
    uvIndex: s(c.uv_index),
  }

  const h = r.hourly
  const points: HourlyPoint[] = h.time.map((t, i) => ({
    time: at(t),
    temperature: h.temperature_2m[i] ?? null,
    apparentTemperature: h.apparent_temperature[i] ?? null,
    humidity: h.relative_humidity_2m[i] ?? null,
    dewPoint: h.dew_point_2m[i] ?? null,
    pressure: h.pressure_msl[i] ?? null,
    precipitation: h.precipitation[i] ?? null,
    precipitationProbability: h.precipitation_probability[i] ?? null,
    windSpeed: h.wind_speed_10m[i] ?? null,
    windDirection: h.wind_direction_10m[i] ?? null,
    gust: h.wind_gusts_10m[i] ?? null,
    cloudCover: h.cloud_cover[i] ?? null,
    visibility: km(h.visibility[i]),
    uvIndex: h.uv_index[i] ?? null,
    solarRadiation: h.shortwave_radiation?.[i] ?? null,
    condition: wmoToCondition(h.weather_code[i] ?? null),
  }))

  // past_days gives yesterday too; the outlook starts today (JST).
  const today = jstDateKey(currentTime)
  const d = r.daily
  const days: DailyPoint[] = d.time
    .map((date, i) => ({
      date,
      condition: wmoToCondition(d.weather_code[i] ?? null),
      tempMax: d.temperature_2m_max[i] ?? null,
      tempMin: d.temperature_2m_min[i] ?? null,
      precipitationSum: d.precipitation_sum[i] ?? null,
      precipitationProbability: d.precipitation_probability_max[i] ?? null,
      windSpeedMax: d.wind_speed_10m_max[i] ?? null,
      gustMax: d.wind_gusts_10m_max[i] ?? null,
      windDirectionDominant: d.wind_direction_10m_dominant[i] ?? null,
      uvIndexMax: d.uv_index_max[i] ?? null,
      sunrise: d.sunrise[i] ? at(d.sunrise[i]!) : null,
      sunset: d.sunset[i] ? at(d.sunset[i]!) : null,
    }))
    .filter((day) => day.date >= today)
    .slice(0, 7)

  return {
    current,
    hourly: { points, provenance: { ...prov, kind: 'forecast', validFrom: currentTime } },
    daily: { days, provenance: { ...prov, kind: 'forecast' } },
  }
}

export function adaptExtendedDaily(r: ExtendedDailyResponse, retrievedAt: Instant): ExtendedDaily {
  const d = r.daily
  return {
    today: jstDateKey(retrievedAt),
    days: d.time.map((date, i) => ({
      date,
      condition: wmoToCondition(d.weather_code[i] ?? null),
      tempMax: d.temperature_2m_max[i] ?? null,
      tempMin: d.temperature_2m_min[i] ?? null,
      precipitationSum: d.precipitation_sum[i] ?? null,
      precipitationProbability: d.precipitation_probability_max[i] ?? null,
      windSpeedMax: d.wind_speed_10m_max[i] ?? null,
      gustMax: null,
      windDirectionDominant: null,
      uvIndexMax: null,
      sunrise: null,
      sunset: null,
    })),
    provenance: { source: 'openmeteo', kind: 'forecast', label: MODEL_LABEL, retrievedAt },
  }
}
