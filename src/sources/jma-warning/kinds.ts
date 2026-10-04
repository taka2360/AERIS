/**
 * JMA warning kind codes for the new disaster-prevention information system
 * (effective 2026-05-28, `bosai/warning/data/r8/`).
 *
 * Transcribed from the code table embedded in https://www.jma.go.jp/bosai/warning/
 * (retrieved 2026-10-04). Re-verify against that page when JMA revises the system.
 */
import type { AlertSeverity } from '@/domain/model'

export const KIND_DEFINITIONS_VERSION = 'jma-r8@2026-10-04'

export type KindDef = {
  /** Phenomenon shown on its own, e.g. '大雨' */
  phenomenon: string
  /** Official name, e.g. 'レベル３大雨警報' */
  name: string
  severity: AlertSeverity
  /** Evacuation-related alert level (2–5) for rain / landslide / storm surge */
  level?: number
}

const SEVERITY: Record<number, AlertSeverity> = {
  20: 'advisory',
  30: 'warning',
  40: 'danger',
  50: 'emergency',
}
const SUFFIX: Record<AlertSeverity, string> = {
  advisory: '注意報',
  warning: '警報',
  danger: '危険警報',
  emergency: '特別警報',
}
const FW_DIGIT = ['０', '１', '２', '３', '４', '５']

/** [code, phenomenon (as named at that severity), JMA level, carries alert level?] */
const TABLE: Array<[string, string, number, boolean]> = [
  // Heavy rain (inundation)
  ['10', '大雨', 20, true],
  ['03', '大雨', 30, true],
  ['43', '大雨', 40, true],
  ['33', '大雨', 50, true],
  // Landslide
  ['29', '土砂災害', 20, true],
  ['09', '土砂災害', 30, true],
  ['49', '土砂災害', 40, true],
  ['39', '土砂災害', 50, true],
  // Storm surge
  ['19', '高潮', 20, true],
  ['08', '高潮', 30, true],
  ['48', '高潮', 40, true],
  ['38', '高潮', 50, true],
  // Wind
  ['15', '強風', 20, false],
  ['05', '暴風', 30, false],
  ['35', '暴風', 50, false],
  // Wind + snow
  ['13', '風雪', 20, false],
  ['02', '暴風雪', 30, false],
  ['32', '暴風雪', 50, false],
  // Snow
  ['12', '大雪', 20, false],
  ['06', '大雪', 30, false],
  ['36', '大雪', 50, false],
  // Waves
  ['16', '波浪', 20, false],
  ['07', '波浪', 30, false],
  ['37', '波浪', 50, false],
  // Advisory-only phenomena
  ['14', '雷', 20, false],
  ['17', '融雪', 20, false],
  ['20', '濃霧', 20, false],
  ['21', '乾燥', 20, false],
  ['22', 'なだれ', 20, false],
  ['23', '低温', 20, false],
  ['24', '霜', 20, false],
  ['25', '着氷', 20, false],
  ['26', '着雪', 20, false],
]

export const KINDS: Record<string, KindDef> = Object.fromEntries(
  TABLE.map(([code, phenomenon, jmaLevel, leveled]) => {
    const severity = SEVERITY[jmaLevel]!
    const level = leveled ? jmaLevel / 10 : undefined
    const prefix = level ? `レベル${FW_DIGIT[level]}` : ''
    return [
      code,
      { phenomenon, name: `${prefix}${phenomenon}${SUFFIX[severity]}`, severity, level },
    ]
  }),
)

export function kindOf(code: string): KindDef | undefined {
  return KINDS[code]
}
