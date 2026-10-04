/**
 * Pure view-model for the timeline: slices the hourly series to a window and
 * precomputes positions of "now", day boundaries and night intervals.
 */
import type { DailyPoint, HourlyPoint } from '@/domain/model'
import { epoch, jstDateKey, jstParts, type Instant } from '@/domain/time'

export type TimelineModel = {
  points: HourlyPoint[]
  /** Fractional index of "now" within points */
  nowIndex: number
  /** Index of the hourly point nearest to now */
  nowPoint: number
  dayStarts: Array<{ index: number; date: string }>
  nights: Array<{ from: number; to: number }>
}

export function buildTimelineModel(
  hourly: HourlyPoint[],
  daily: DailyPoint[],
  now: Instant,
  pastHours = 6,
  futureHours = 24,
): TimelineModel | null {
  const t = epoch(now)
  const from = t - pastHours * 3_600_000 - 3_600_000
  const to = t + futureHours * 3_600_000
  const points = hourly.filter((p) => {
    const ms = epoch(p.time)
    return ms > from && ms <= to
  })
  if (points.length < 2) return null

  const t0 = epoch(points[0]!.time)
  const indexOf = (ms: number) => (ms - t0) / 3_600_000
  const nowIndex = indexOf(t)
  const nowPoint = Math.max(0, Math.min(points.length - 1, Math.round(nowIndex)))

  const dayStarts = points
    .map((p, index) => ({ index, date: jstDateKey(p.time), hour: jstParts(p.time).hour }))
    .filter((d) => d.hour === 0)
    .map(({ index, date }) => ({ index, date }))

  // Night = sunset(day N) → sunrise(day N+1). Clamp to the window.
  const last = points.length - 1
  const nights: TimelineModel['nights'] = []
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const firstDate = jstDateKey(points[0]!.time)
  // Night that started yesterday may still cover the window start.
  const edges: Array<{ sunset: number | null; sunrise: number | null }> = []
  for (let i = -1; i < sorted.length; i++) {
    const today = sorted[i]
    const next = sorted[i + 1]
    const sunset = today?.sunset ? epoch(today.sunset) : null
    const sunrise = next?.sunrise ? epoch(next.sunrise) : null
    if (i === -1 && next && next.date === firstDate) edges.push({ sunset: null, sunrise })
    else edges.push({ sunset, sunrise })
  }
  for (const e of edges) {
    const a = e.sunset == null ? 0 : indexOf(e.sunset)
    const b = e.sunrise == null ? last : indexOf(e.sunrise)
    const fromI = Math.max(0, a)
    const toI = Math.min(last, b)
    if (toI > fromI && !(e.sunset == null && e.sunrise == null))
      nights.push({ from: fromI, to: toI })
  }

  return { points, nowIndex, nowPoint, dayStarts, nights }
}
