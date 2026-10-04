/**
 * EarthProvider — facade over per-domain providers. UI/query code reaches
 * every Earth-observation source through `provider.earth.<domain>.<call>`;
 * live and mock implementations are split by domain so no single interface
 * grows without bound.
 */
import type { SourceObservation } from '@/domain/earth/common'
import type { QuakeSolution, TsunamiReport } from '@/domain/earth/reports'
import type { SourceResult } from '@/domain/result'
import type { LightningStroke } from '@/domain/earth/events'
import type { HazardAssessment } from '@/domain/earth/assessments'
import type {
  FieldClass,
  FieldSample,
  PointSeries,
  RasterFieldKind,
  RasterFieldSeries,
  RasterFrame,
} from '@/domain/earth/fields'
import type { GeoPoint } from '@/domain/earth/common'
import type { Instant } from '@/domain/time'
import type { CycloneReport } from '@/sources/jma-typhoon'
import type { VolcanoFeed } from '@/sources/jma-volcano'
import type { KikikuruSeries } from '@/sources/jma-tile'
import type { DischargeKey } from '@/sources/openmeteo-flood'

export type { Scenario } from '@/sources/mock/scenario'

type Obs<T> = SourceObservation<T>

export interface SeismicProvider {
  /** JMA bulletins, one observation per event */
  jma(signal?: AbortSignal): Promise<SourceResult<Obs<QuakeSolution>[]>>
  /** USGS M4.5+ for the past week (global) */
  usgs(signal?: AbortSignal): Promise<SourceResult<Obs<QuakeSolution>[]>>
  /** JMA detail bulletin: per-station intensity */
  jmaDetail(
    obs: Obs<QuakeSolution>,
    signal?: AbortSignal,
  ): Promise<SourceResult<Obs<QuakeSolution>>>
}

export interface TsunamiProvider {
  /** Bulletins of recent tsunami events (one report per event) */
  reports(signal?: AbortSignal): Promise<SourceResult<Obs<TsunamiReport>[]>>
  /** Forecast-area coastlines: area code → polylines [lon, lat] */
  areas(signal?: AbortSignal): Promise<SourceResult<Record<string, [number, number][][]>>>
}

export interface AtmosphereProvider {
  /** Tropical cyclones tracked by JMA (one report per cyclone, latest issuance) */
  cyclones(signal?: AbortSignal): Promise<SourceResult<Obs<CycloneReport>[]>>
  /** JMA weather information bulletins (気象解説情報 / 線状降水帯 …) as assessments */
  information(signal?: AbortSignal): Promise<SourceResult<HazardAssessment[]>>
  /** 雷活動度 and 竜巻発生確度 nowcast series (analysis + 1 h nowcast) */
  thunder(
    signal?: AbortSignal,
  ): Promise<SourceResult<{ lightning: RasterFieldSeries; tornado: RasterFieldSeries }>>
  /** Individual lightning discharges (LIDEN) of the past hour, per 5-minute frame */
  strokes(
    signal?: AbortSignal,
  ): Promise<SourceResult<{ strokes: LightningStroke[]; frames: Instant[] }>>
  /** Classified value of a field around a point (highest class within radiusKm) */
  sample(
    kind: RasterFieldKind,
    frame: RasterFrame,
    series: RasterFieldSeries,
    point: GeoPoint,
    radiusKm: number,
    signal?: AbortSignal,
  ): Promise<SourceResult<FieldSample<FieldClass>>>
}

export interface VolcanoProvider {
  /** Monitored volcanoes and the latest bulletins of those with one listed */
  volcanoes(signal?: AbortSignal): Promise<SourceResult<VolcanoFeed>>
}

export interface HydrologyProvider {
  /** 土砂・浸水・洪水キキクル series (JMA risk assessments) */
  kikikuru(signal?: AbortSignal): Promise<SourceResult<KikikuruSeries>>
  /** Modeled river discharge at the nearest GloFAS river cell */
  river(point: GeoPoint, signal?: AbortSignal): Promise<SourceResult<PointSeries<DischargeKey>>>
}

export interface EarthProvider {
  seismic: SeismicProvider
  tsunami: TsunamiProvider
  atmosphere: AtmosphereProvider
  volcano: VolcanoProvider
  hydrology: HydrologyProvider
}
