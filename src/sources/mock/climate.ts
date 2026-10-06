/**
 * Synthetic 1991–2020 normals for the mock provider: a smooth seasonal cycle
 * close to Tokyo's, with percentiles at fixed offsets from the mean.
 */
import { normalsWindow, shiftDate, type NormalDay } from '@/domain/climate'

function dayOfYear(date: string): number {
  const ms = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))
  return (ms - Date.UTC(+date.slice(0, 4), 0, 1)) / 86_400_000 + 1
}

const r1 = (v: number) => Math.round(v * 10) / 10

export function synthNormals(anchor: string): NormalDay[] {
  const { from, to } = normalsWindow(anchor)
  const out: NormalDay[] = []
  for (let d = from; d <= to; d = shiftDate(d, 1)) {
    const season = Math.cos((2 * Math.PI * (dayOfYear(d) - 213)) / 365)
    const tmax = r1(20.3 + 10.4 * season)
    const tmin = r1(12.6 + 10.6 * season)
    const spread = (m: number, w: number) => ({
      p10: r1(m - 2.6 * w),
      p33: r1(m - 0.8 * w),
      p67: r1(m + 0.8 * w),
      p90: r1(m + 2.6 * w),
    })
    out.push({
      date: d,
      tmax,
      tmin,
      precip: r1(4.6 + 2.2 * Math.max(0, season)),
      tmaxPct: spread(tmax, 1),
      tminPct: spread(tmin, 0.9),
      samples: 450,
    })
  }
  return out
}
