/**
 * EnvironmentalField — continuous quantities over space and/or time:
 * rainfall, lightning activity, wave height, air quality, solar wind…
 * Fields have values everywhere (or at a sampled point); they do not
 * "happen". Point values are produced by sampling, never stored as events.
 */
import type { Provenance } from '../model'
import type { Instant } from '../time'
import type { DecodeStatus, Derivation, TemporalRole } from './common'

/** One raster frame (XYZ tiles) valid over [validFrom, validUntil). */
export type RasterFrame = {
  validFrom: Instant
  validUntil: Instant
  issuedAt?: Instant
  role: TemporalRole
  tileUrlTemplate: string
}

export type RasterFieldKind =
  | 'precip-intensity' // 降水強度 (hrpns)
  | 'lightning-activity' // 雷活動度 (thns)
  | 'tornado-probability' // 竜巻発生確度 (trns)
  | 'kikikuru-land' // 土砂キキクル
  | 'kikikuru-inundation' // 浸水キキクル
  | 'kikikuru-flood' // 洪水キキクル
  | 'snow-depth' // 積雪の深さ
  | 'snowfall-3h' // 3時間降雪量

export type RasterFieldSeries = {
  kind: RasterFieldKind
  frames: RasterFrame[]
  derivation: Derivation
  provenance: Provenance
}

/** A time series at one location (CAMS PM2.5 over Tokyo, GloFAS discharge…). */
export type PointSeries<K extends string = string> = {
  lat: number
  lon: number
  /** Parameter → unit */
  units: Partial<Record<K, string>>
  points: Array<{ time: Instant; role: TemporalRole; values: Partial<Record<K, number | null>> }>
  derivation: Derivation
  provenance: Provenance
}

/** A regular lat/lon grid valid at one time (OVATION aurora, marine samples). */
export type GridField = {
  validAt: Instant
  role: TemporalRole
  /** Cells as [lon, lat, value]; lon already normalised to [-180, 180) */
  cells: Array<[number, number, number]>
  unit: string
}

export type GridFieldSeries = {
  kind: string
  grids: GridField[]
  derivation: Derivation
  provenance: Provenance
}

/** The result of sampling a field at a point. */
export type FieldSample<V = number> = {
  value: V | null
  validFrom: Instant
  validUntil: Instant
  role: TemporalRole
  decode: DecodeStatus
  provenance: Provenance
}
