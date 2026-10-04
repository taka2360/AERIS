/**
 * EarthProvider — facade over per-domain providers. UI/query code reaches
 * every Earth-observation source through `provider.earth.<domain>.<call>`;
 * live and mock implementations are split by domain so no single interface
 * grows without bound.
 */
import type { SourceObservation } from '@/domain/earth/common'
import type { QuakeSolution, TsunamiReport } from '@/domain/earth/reports'
import type { SourceResult } from '@/domain/result'

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

export interface EarthProvider {
  seismic: SeismicProvider
  tsunami: TsunamiProvider
}
