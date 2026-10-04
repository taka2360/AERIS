/**
 * Source-level payloads carried inside SourceObservation<T>. These are what
 * one agency said, normalised to AERIS units but not yet fused.
 */
import type { Instant } from '../time'
import type { IntensityObservation } from './events'

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
