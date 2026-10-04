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

/** One forecast-area item of a JMA tsunami bulletin. */
export type TsunamiAreaForecast = {
  areaCode: string
  areaName: string
  /** JMA kind code (52/53 大津波警報, 51 警報, 62 注意報, 71–73 予報, 50/60 解除, 00 なし) */
  kindCode: string
  kindName: string
  lastKindCode?: string
  /** Expected maximum height as stated: '<0.2', '1', '3', '5', '10', '>10' */
  maxHeight?: string
  /** Qualitative height ('巨大', '高い') used instead of a number at first */
  maxHeightCondition?: string
  firstArrival?: Instant
  /** e.g. '第１波の到達を確認', 'ただちに津波来襲と予測' */
  firstArrivalCondition?: string
}

export type TsunamiStationObservation = {
  station: string
  areaName?: string
  firstArrival?: Instant
  /** First-wave polarity ('押し' / '引き') */
  initial?: string
  maxHeight?: string
  maxHeightAt?: Instant
  /** e.g. '観測中', '上昇中' */
  condition?: string
}

/** A tsunami bulletin set for one earthquake event, as JMA stated it. */
export type TsunamiReport = {
  eventId: string
  issuedAt: Instant
  title: string
  headline?: string
  /** Head.ValidDateTime — set for forecasts (若干の海面変動) */
  validUntil?: Instant
  cancelled: boolean
  forecasts: TsunamiAreaForecast[]
  observations: TsunamiStationObservation[]
  origin?: { time: Instant; areaName?: string; lat?: number; lon?: number; magnitude?: number }
  comments: string[]
}
