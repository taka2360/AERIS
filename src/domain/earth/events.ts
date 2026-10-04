/**
 * NaturalEvent — a discrete phenomenon that begins (or is forecast to begin)
 * and ends: an earthquake, a cyclone, an eruption. Continuous fields
 * (rain, wave height, air quality) are NOT events; see fields.ts.
 * Authority statements about an event are HazardAssessments; see assessments.ts.
 */
import type { Provenance } from '../model'
import type { Instant } from '../time'
import type { AssessmentRef } from './assessments'
import type {
  Derivation,
  DerivedFieldSource,
  EventMeasure,
  GeoPoint,
  Geometry,
  SourceRef,
  TemporalRole,
  TimeFrame,
} from './common'

export type EventCategory =
  | 'earthquake'
  | 'tsunami'
  | 'volcano'
  | 'tropical-cyclone'
  | 'severe-storm'
  | 'wildfire'
  | 'landslide'
  | 'flood'
  | 'space-weather'
  | 'dust-haze'
  | 'sea-ice'
  | 'snow-ice'
  | 'other'

export type Lifecycle = 'ongoing' | 'ended' | 'cancelled'

interface BaseEvent {
  /** Canonical id (`category:primarySource:nativeId`) */
  id: string
  title: string
  place?: string
  geometry: Geometry
  time: TimeFrame
  lifecycle: Lifecycle
  measures: EventMeasure[]
  assessments: AssessmentRef[]
  /** Every source record that contributed */
  sources: SourceRef[]
  /** Fields whose value AERIS picked or computed from several inputs */
  fieldSources?: Record<string, DerivedFieldSource>
  /** Other canonical events this one is linked to (not merged) */
  related?: Array<{ id: string; relation: 'related' | 'triggered' | 'triggered-by' }>
  derivation: Derivation
  provenance: Provenance
}

// ── Earthquake ──────────────────────────────────────────────────────────────

export type IntensityObservation = {
  code: string
  name: string
  lat: number
  lon: number
  /** JMA intensity class as written: '1'..'4', '5-', '5+', '6-', '6+', '7' */
  intensity: string
}

export type EarthquakeDetail = {
  hypocenter: GeoPoint & { depthKm: number | null; areaName?: string }
  /** JMA max intensity, when JMA reported one */
  maxIntensity?: string
  stations: IntensityObservation[]
  /** Free text such as the tsunami comment */
  comments: string[]
  /** USGS / JMA indicate a tsunami message accompanied this event */
  tsunamiFlag?: boolean
}

export interface EarthquakeEvent extends BaseEvent {
  category: 'earthquake'
  detail: EarthquakeDetail
}

// ── Tsunami ─────────────────────────────────────────────────────────────────

export type TsunamiObservation = {
  station: string
  lat?: number
  lon?: number
  arrivalAt?: Instant
  maxHeightM?: number
  /** e.g. '上昇中', '観測中' */
  condition?: string
}

export type TsunamiDetail = {
  originEventRef?: string
  observations: TsunamiObservation[]
  headline?: string
}

export interface TsunamiEvent extends BaseEvent {
  category: 'tsunami'
  detail: TsunamiDetail
}

// ── Volcano ─────────────────────────────────────────────────────────────────

export type VolcanoDetail = {
  volcanoCode: string
  nameEn?: string
  /** Latest eruption-alert level as stated, when the volcano has the system */
  alertLevel?: string
  plumeHeightM?: number
  notes: string[]
}

export interface VolcanoEvent extends BaseEvent {
  category: 'volcano'
  detail: VolcanoDetail
}

// ── Tropical cyclone ────────────────────────────────────────────────────────

export type TrackPoint = {
  validAt: Instant
  lat: number
  lon: number
  pressureHpa?: number
  maxWindMs?: number
  /** Probability-circle radius (km) for forecast points */
  circleKm?: number
  /** Storm-warning area radius (km) */
  stormAreaKm?: number
  role: TemporalRole
}

export type ForecastIssue = { issuedAt: Instant; points: TrackPoint[] }

export type CycloneDetail = {
  name?: string
  number?: string
  /** Agency category code, e.g. JMA TY / STS / TS / TD / LOW, NHC HU / TS */
  category?: string
  categoryLabel?: string
  /** JMA 強さ / 大きさ classes as stated ('非常に強い', '大型') */
  intensityClass?: string
  sizeClass?: string
  observedPosition?: TrackPoint
  /** Timed past positions (when the agency provides times) */
  observedTrack: TrackPoint[]
  /** Past path as drawn by the agency, without times: shape only, never interpolated */
  observedPath?: [number, number][]
  /** Each forecast keeps its own issuance; points are never mixed across issues */
  forecasts: ForecastIssue[]
  /** Gale area (強風域, 15 m/s+) around the analysed centre */
  galeArea?: { lat: number; lon: number; radiusKm: number }
  /** Tangent lines of the probability circles (forecast cone outline), [lon, lat] */
  coneLines?: [number, number][][]
  /** Outline of the storm-warning area (暴風警戒域), [lon, lat] */
  stormLines?: [number, number][][]
  movement?: { directionDeg?: number; directionText?: string; speedKmh?: number }
}

export interface CycloneEvent extends BaseEvent {
  category: 'tropical-cyclone'
  detail: CycloneDetail
}

// ── Wildfire ────────────────────────────────────────────────────────────────

export type WildfireDetail = {
  /** How AERIS (or the source) defined this fire */
  basis: 'firms-cluster' | 'eonet-event' | 'gdacs-event'
  detectionCount?: number
  maxFrpMw?: number
  areaKm2?: number
}

export interface WildfireEvent extends BaseEvent {
  category: 'wildfire'
  detail: WildfireDetail
}

// ── Space weather ───────────────────────────────────────────────────────────

export type SpaceWeatherDetail = {
  kind: 'flare' | 'cme' | 'geomagnetic-storm' | 'radiation-storm' | 'alert'
  message?: string
  productId?: string
}

export interface SpaceWeatherEvent extends BaseEvent {
  category: 'space-weather'
  detail: SpaceWeatherDetail
}

// ── Generic categories from aggregators ─────────────────────────────────────

export type AggregatedDetail = {
  /** GDACS / EONET native type, e.g. 'FL', 'severeStorms' */
  nativeType: string
  url?: string
  description?: string
}

export interface SevereStormEvent extends BaseEvent {
  category: 'severe-storm'
  detail: AggregatedDetail
}
export interface LandslideEvent extends BaseEvent {
  category: 'landslide'
  detail: AggregatedDetail
}
export interface FloodEvent extends BaseEvent {
  category: 'flood'
  detail: AggregatedDetail
}
export interface DustHazeEvent extends BaseEvent {
  category: 'dust-haze'
  detail: AggregatedDetail
}
export interface SeaIceEvent extends BaseEvent {
  category: 'sea-ice'
  detail: AggregatedDetail
}
export interface SnowIceEvent extends BaseEvent {
  category: 'snow-ice'
  detail: AggregatedDetail
}

/** AERIS does not understand this category; the native label is kept verbatim. */
export interface OtherEvent extends BaseEvent {
  category: 'other'
  detail: AggregatedDetail & { nativeCategory: string }
}

export type NaturalEvent =
  | EarthquakeEvent
  | TsunamiEvent
  | VolcanoEvent
  | CycloneEvent
  | WildfireEvent
  | SpaceWeatherEvent
  | SevereStormEvent
  | LandslideEvent
  | FloodEvent
  | DustHazeEvent
  | SeaIceEvent
  | SnowIceEvent
  | OtherEvent

/** Satellite active-fire detection: an observation, not a fire "event". */
export type ActiveFireDetection = {
  id: string
  lat: number
  lon: number
  detectedAt: Instant
  frpMw: number | null
  confidence: 'low' | 'nominal' | 'high'
  satellite: string
  daynight: 'D' | 'N'
}

export function measure(e: NaturalEvent, kind: EventMeasure['kind']): EventMeasure | undefined {
  return e.measures.find((m) => m.kind === kind)
}

export function measures(e: NaturalEvent, kind: EventMeasure['kind']): EventMeasure[] {
  return e.measures.filter((m) => m.kind === kind)
}

/** The reference instant of an event for ordering and time windows. */
export function eventTime(e: NaturalEvent): Instant | undefined {
  return e.time.startedAt ?? e.time.observedAt ?? e.time.issuedAt ?? e.time.validFrom
}
