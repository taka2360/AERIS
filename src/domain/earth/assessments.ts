/**
 * HazardAssessment — what an authority says about a hazard for an area and
 * a period (warnings, advisories, risk levels, scales). Kept separate from
 * the phenomenon itself: one tsunami has many assessments, one per coast.
 */
import type { Provenance } from '../model'
import type { Geometry, SourceRole, TimeFrame } from './common'

export type AssessmentScheme =
  | 'jma-intensity' // 震度階級
  | 'jma-tsunami' // 大津波警報 / 津波警報 / 津波注意報 / 津波予報
  | 'jma-volcano' // 噴火警戒レベル 1–5
  | 'jma-warning' // 気象警報・注意報
  | 'jma-information' // 気象情報(気象解説情報・顕著な大雨に関する情報 等)
  | 'jma-kikikuru' // キキクル (危険度分布)
  | 'jma-typhoon' // 台風の強さ・大きさ階級
  | 'gdacs' // Green / Orange / Red
  | 'noaa-g' // Geomagnetic storm G1–G5
  | 'noaa-s' // Solar radiation storm S1–S5
  | 'noaa-r' // Radio blackout R1–R5

export type HazardAssessment = {
  id: string
  /** The phenomenon this assessment is about, when known */
  eventRef?: string
  scheme: AssessmentScheme
  /** Level exactly as the authority states it */
  level: { value: string; label: string }
  /** Ordinal rank within the scheme (higher = more severe); for sorting only */
  rank: number
  area: { code?: string; name: string; geometry?: Geometry }
  time: TimeFrame
  status: 'issued' | 'continued' | 'cancelled'
  sourceRole: SourceRole
  /** Scheme-specific numbers, e.g. expected tsunami height */
  values?: Record<string, number | string>
  provenance: Provenance
}

export type AssessmentRef = { id: string; scheme: AssessmentScheme }
