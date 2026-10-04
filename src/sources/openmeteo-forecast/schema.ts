import { z } from 'zod'

const num = z.number().nullable()
const nums = z.array(num)

export const CURRENT_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'dew_point_2m',
  'pressure_msl',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'visibility',
  'uv_index',
] as const

export const HOURLY_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'dew_point_2m',
  'pressure_msl',
  'precipitation',
  'precipitation_probability',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'visibility',
  'uv_index',
] as const

export const DAILY_VARS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'wind_direction_10m_dominant',
  'uv_index_max',
  'sunrise',
  'sunset',
] as const

export const forecastSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  utc_offset_seconds: z.number(),
  current: z.object({
    time: z.string(),
    temperature_2m: num,
    apparent_temperature: num,
    relative_humidity_2m: num,
    dew_point_2m: num,
    pressure_msl: num,
    precipitation: num,
    weather_code: num,
    cloud_cover: num,
    wind_speed_10m: num,
    wind_direction_10m: num,
    wind_gusts_10m: num,
    visibility: num,
    uv_index: num,
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: nums,
    apparent_temperature: nums,
    relative_humidity_2m: nums,
    dew_point_2m: nums,
    pressure_msl: nums,
    precipitation: nums,
    precipitation_probability: nums,
    weather_code: nums,
    cloud_cover: nums,
    wind_speed_10m: nums,
    wind_direction_10m: nums,
    wind_gusts_10m: nums,
    visibility: nums,
    uv_index: nums,
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: nums,
    temperature_2m_max: nums,
    temperature_2m_min: nums,
    precipitation_sum: nums,
    precipitation_probability_max: nums,
    wind_speed_10m_max: nums,
    wind_gusts_10m_max: nums,
    wind_direction_10m_dominant: nums,
    uv_index_max: nums,
    sunrise: z.array(z.string().nullable()),
    sunset: z.array(z.string().nullable()),
  }),
})

export type ForecastResponse = z.infer<typeof forecastSchema>

/** Multi-location response for the wind field (array when >1 coordinate). */
export const windFieldSchema = z.array(
  z.object({
    latitude: z.number(),
    longitude: z.number(),
    current: z.object({ wind_speed_10m: num, wind_direction_10m: num }),
  }),
)
