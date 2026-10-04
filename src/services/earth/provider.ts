/**
 * EarthProvider — facade over per-domain providers. UI/query code reaches
 * every Earth-observation source through `provider.earth.<domain>.<call>`;
 * live and mock implementations are split by domain so no single interface
 * grows without bound.
 */
import type { SourceObservation } from '@/domain/earth/common'
import type { QuakeSolution } from '@/domain/earth/reports'
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

export interface EarthProvider {
  seismic: SeismicProvider
}
