/**
 * Climate normals and anomalies. Normals are computed from a daily history
 * (reanalysis, 1991–2020) with a ±7-day window around each calendar day, so
 * each normal rests on ~450 samples. The category of a day (平年並み etc.)
 * is AERIS's own rule on those samples' percentiles — styled after JMA's
 * 10/33/67/90% split, but not a JMA product.
 */
import type { Provenance } from './model'

export const NORMALS_PERIOD = { from: 1991, to: 2020 } as const
export const ANOMALY_RULE = { method: 'aeris:climate-anomaly', version: '1' } as const
const HALF_WINDOW_DAYS = 7

export type ClimateDay = {
  /** 'YYYY-MM-DD' (JST) */
  date: string
  tmax: number | null
  tmin: number | null
  precip: number | null
}

export type Percentiles = { p10: number; p33: number; p67: number; p90: number }

export type NormalDay = {
  /** Calendar date the normal is for, 'YYYY-MM-DD' */
  date: string
  tmax: number
  tmin: number
  /** Mean daily precipitation, mm */
  precip: number
  tmaxPct: Percentiles
  tminPct: Percentiles
  samples: number
}

const DAY_MS = 86_400_000
const dayMs = (date: string) =>
  Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))

/** Days between `date` and the same calendar day in another year (circular, ≤ 183). */
function calendarDistance(date: string, other: string): number {
  const y = +other.slice(0, 4)
  let best = Infinity
  for (const yy of [y - 1, y, y + 1]) {
    // 29 Feb maps to 28 Feb in common years.
    const md =
      date.slice(5) === '02-29' && new Date(Date.UTC(yy, 1, 29)).getUTCMonth() !== 1
        ? '02-28'
        : date.slice(5)
    best = Math.min(best, Math.abs(dayMs(`${yy}-${md}`) - dayMs(other)) / DAY_MS)
  }
  return best
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo)
}

const r1 = (v: number) => Math.round(v * 10) / 10
const pct = (vals: number[]): Percentiles => {
  const s = [...vals].sort((a, b) => a - b)
  return {
    p10: r1(percentile(s, 0.1)),
    p33: r1(percentile(s, 1 / 3)),
    p67: r1(percentile(s, 2 / 3)),
    p90: r1(percentile(s, 0.9)),
  }
}
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length

export function computeNormals(history: ClimateDay[], dates: string[]): NormalDay[] {
  return dates.flatMap((date) => {
    const win = history.filter((h) => calendarDistance(date, h.date) <= HALF_WINDOW_DAYS)
    const tmax = win.flatMap((h) => (h.tmax == null ? [] : [h.tmax]))
    const tmin = win.flatMap((h) => (h.tmin == null ? [] : [h.tmin]))
    const precip = win.flatMap((h) => (h.precip == null ? [] : [h.precip]))
    if (tmax.length < 30 || tmin.length < 30) return []
    return [
      {
        date,
        tmax: r1(mean(tmax)),
        tmin: r1(mean(tmin)),
        precip: r1(precip.length ? mean(precip) : 0),
        tmaxPct: pct(tmax),
        tminPct: pct(tmin),
        samples: tmax.length,
      },
    ]
  })
}

export type AnomalyClass = 'much-below' | 'below' | 'normal' | 'above' | 'much-above'

export const ANOMALY_LABEL: Record<AnomalyClass, string> = {
  'much-below': 'かなり低い',
  below: '低い',
  normal: '平年並み',
  above: '高い',
  'much-above': 'かなり高い',
}

export function classify(v: number, p: Percentiles): AnomalyClass {
  if (v < p.p10) return 'much-below'
  if (v < p.p33) return 'below'
  if (v <= p.p67) return 'normal'
  if (v <= p.p90) return 'above'
  return 'much-above'
}

/** Mean of (value − normal) over the days both are known; null when none. */
export function meanAnomaly(
  days: Array<{ date: string; value: number | null }>,
  normals: Map<string, number>,
): number | null {
  const d = days.flatMap((x) => {
    const n = normals.get(x.date)
    return x.value == null || n == null ? [] : [x.value - n]
  })
  return d.length ? r1(mean(d)) : null
}

/** 'YYYY-MM-DD' shifted by whole days. */
export function shiftDate(date: string, days: number): string {
  return new Date(dayMs(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Monday on or before `date`: normals are fetched per week so the request
 * window (and its cache key) changes once a week, not every day.
 */
export function weekAnchor(date: string): string {
  const dow = new Date(dayMs(date)).getUTCDay()
  return shiftDate(date, -((dow + 6) % 7))
}

/** Calendar days the normals cover for an anchor: 31 days back to 28 days ahead of it. */
export function normalsWindow(anchor: string): { from: string; to: string } {
  return { from: shiftDate(anchor, -31), to: shiftDate(anchor, 28) }
}

export type ClimateNormals = {
  /** Week anchor the window was built for (see weekAnchor) */
  anchor: string
  days: NormalDay[]
  provenance: Provenance
}
