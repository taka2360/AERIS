/**
 * Air quality: the AERIS index (scheme 'aeris') and separate comparisons
 * with WHO guidelines and Japan's environmental quality standards.
 * Standards are defined on daily (or 8-hour) averages while CAMS values are
 * hourly model output, so comparisons are indicative only.
 */
import type { SystemStatus } from './derive'

export type AirLevel = 'nominal' | 'moderate' | 'poor' | 'critical'

export const AIR_LEVEL_LABEL: Record<AirLevel, string> = {
  nominal: 'NOMINAL',
  moderate: 'MODERATE',
  poor: 'POOR',
  critical: 'CRITICAL',
}

type Pollutant = 'pm2_5' | 'pm10' | 'ozone' | 'nitrogen_dioxide'

/** AERIS breakpoints (μg/m³): upper bounds of nominal / moderate / poor. */
const BREAKS: Record<Pollutant, [number, number, number]> = {
  // WHO 24 h 15 · 環境基準(日平均) 35 · 環境省 注意喚起の暫定指針(日平均) 70
  pm2_5: [15, 35, 70],
  // WHO 24 h 45 · 環境基準 SPM(日平均) 100 ≈ PM10 · ×2
  pm10: [45, 100, 200],
  // WHO 8 h 100 · 光化学オキシダント 環境基準 0.06 ppm ≈ 118 · 注意報 0.12 ppm ≈ 235
  ozone: [100, 118, 235],
  // WHO 24 h 25 · 環境基準(日平均) 0.04–0.06 ppm ≈ 75–113
  nitrogen_dioxide: [25, 75, 113],
}

/** Reference values for the comparison rows (μg/m³). */
export const REFERENCES: Record<
  Pollutant,
  { who: number; whoLabel: string; jp: number; jpLabel: string }
> = {
  pm2_5: { who: 15, whoLabel: 'WHO 24h', jp: 35, jpLabel: '環境基準 日平均' },
  pm10: { who: 45, whoLabel: 'WHO 24h', jp: 100, jpLabel: 'SPM 環境基準 日平均' },
  ozone: { who: 100, whoLabel: 'WHO 8h', jp: 118, jpLabel: 'Ox 環境基準 1時間' },
  nitrogen_dioxide: { who: 25, whoLabel: 'WHO 24h', jp: 113, jpLabel: '環境基準 日平均上限' },
}

const ORDER: AirLevel[] = ['nominal', 'moderate', 'poor', 'critical']

export type AirIndex = {
  scheme: 'aeris'
  level: AirLevel
  /** Pollutant that set the level */
  driver: Pollutant | null
  rule: string
}

export function airIndex(values: Partial<Record<Pollutant, number | null>>): AirIndex | null {
  let level: AirLevel | null = null
  let driver: Pollutant | null = null
  for (const p of Object.keys(BREAKS) as Pollutant[]) {
    const v = values[p]
    if (v == null) continue
    const [a, b, c] = BREAKS[p]
    const l: AirLevel = v <= a ? 'nominal' : v <= b ? 'moderate' : v <= c ? 'poor' : 'critical'
    if (level == null || ORDER.indexOf(l) > ORDER.indexOf(level)) {
      level = l
      driver = p
    }
  }
  return level ? { scheme: 'aeris', level, driver, rule: 'aeris:air-index/v1' } : null
}

export const AIR_STATUS: Record<AirLevel, SystemStatus> = {
  nominal: 'nominal',
  moderate: 'active',
  poor: 'elevated',
  critical: 'warning',
}
