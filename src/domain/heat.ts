/**
 * Heat stress: WBGT (暑さ指数) estimated from ordinary weather elements.
 * This is AERIS's own estimate from model values — not the Ministry of the
 * Environment's WBGT forecast — and is always shown with its rule name.
 *
 * Estimation formula used by 環境省 for sites without a WBGT meter
 * (小野ら, 2014):
 *   WBGT = 0.735·Ta + 0.0374·RH + 0.00292·Ta·RH + 7.619·SR − 4.557·SR² − 0.0572·WS − 4.064
 *   Ta [°C], RH [%], SR global solar radiation [kW/m²], WS wind speed [m/s]
 */
export const WBGT_RULE = { method: 'aeris:wbgt-estimate', version: '1' } as const

export function estimateWbgt(
  tempC: number | null,
  humidity: number | null,
  solarWm2: number | null,
  windMs: number | null,
): number | null {
  if (tempC == null || humidity == null) return null
  const sr = Math.max(0, solarWm2 ?? 0) / 1000
  const ws = Math.max(0, windMs ?? 0)
  const v =
    0.735 * tempC +
    0.0374 * humidity +
    0.00292 * tempC * humidity +
    7.619 * sr -
    4.557 * sr * sr -
    0.0572 * ws -
    4.064
  return Math.round(v * 10) / 10
}

export type WbgtLevel = 'safe' | 'caution' | 'warning' | 'severe' | 'danger'

/** 日本生気象学会「日常生活に関する指針」の区分 */
export const WBGT_LEVELS: Array<{ level: WbgtLevel; min: number; ja: string; advice: string }> = [
  { level: 'danger', min: 31, ja: '危険', advice: '外出はなるべく避け、涼しい室内に移動する' },
  {
    level: 'severe',
    min: 28,
    ja: '厳重警戒',
    advice: '外出時は炎天下を避け、室内では室温の上昇に注意',
  },
  { level: 'warning', min: 25, ja: '警戒', advice: '運動や激しい作業をする際は定期的に十分に休息' },
  { level: 'caution', min: 21, ja: '注意', advice: '激しい運動や重労働時には発生する危険性' },
  { level: 'safe', min: -Infinity, ja: 'ほぼ安全', advice: '適宜水分・塩分を補給' },
]

export function wbgtLevel(v: number) {
  return WBGT_LEVELS.find((l) => v >= l.min)!
}
