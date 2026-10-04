import { describe, expect, it } from 'vitest'
import { synthDaily, synthHourly } from '@/sources/mock/generator'
import { buildTimelineModel } from './timeline-model'

describe('buildTimelineModel', () => {
  const now = '2026-10-04T16:24:00+09:00'
  const hourly = synthHourly(now)
  const daily = synthDaily(hourly, now)

  it('slices T-6h … T+24h and locates now', () => {
    const m = buildTimelineModel(hourly, daily, now)!
    expect(m.points[0]!.time).toBe('2026-10-04T10:00:00+09:00')
    expect(m.points.at(-1)!.time).toBe('2026-10-05T16:00:00+09:00')
    expect(m.nowIndex).toBeCloseTo(6.4, 5)
    expect(m.nowPoint).toBe(6)
  })

  it('marks the JST midnight boundary and the night interval', () => {
    const m = buildTimelineModel(hourly, daily, now)!
    expect(m.dayStarts).toEqual([{ index: 14, date: '2026-10-05' }])
    expect(m.nights.length).toBeGreaterThanOrEqual(1)
    const night = m.nights.find((n) => n.from > 6)!
    // Sunset ~17:22 → index ≈ 7.4; sunrise ~05:39 → index ≈ 19.6
    expect(night.from).toBeCloseTo(7.37, 1)
    expect(night.to).toBeCloseTo(19.65, 1)
  })

  it('returns null without enough data', () => {
    expect(buildTimelineModel([], [], now)).toBeNull()
  })
})
