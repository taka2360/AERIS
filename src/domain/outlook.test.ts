import { describe, expect, it } from 'vitest'
import { moonIllumination, moonPhaseName, moonTimes, nextPhase } from './astro'
import {
  classify,
  computeNormals,
  meanAnomaly,
  normalsWindow,
  shiftDate,
  weekAnchor,
  type ClimateDay,
} from './climate'
import { estimateWbgt, wbgtLevel } from './heat'
import { epoch, minutesBetween } from './time'
import { tideAt, tideTurns } from './tide'

describe('moon', () => {
  it('is full and new at the published instants (2024-01)', () => {
    const full = moonIllumination('2024-01-25T17:54:00Z')
    expect(full.fraction).toBeGreaterThan(0.99)
    expect(full.phase).toBeCloseTo(0.5, 1)
    expect(moonPhaseName(full.phase).ja).toBe('満月')
    const fresh = moonIllumination('2024-01-11T11:57:00Z')
    expect(fresh.fraction).toBeLessThan(0.01)
    expect(moonPhaseName(fresh.phase).ja).toBe('新月')
  })

  it('finds the next full moon within an hour of the published time', () => {
    const t = nextPhase('2024-01-12T00:00:00Z', 0.5)
    expect(Math.abs(minutesBetween(t, '2024-01-25T17:54:00Z'))).toBeLessThan(60)
  })

  it('gives rise and set times inside the JST day', () => {
    const { rise, set } = moonTimes('2024-01-20T12:00:00+09:00', 35.68, 139.77)
    for (const t of [rise, set]) {
      if (!t) continue
      expect(epoch(t)).toBeGreaterThanOrEqual(epoch('2024-01-20T00:00:00+09:00'))
      expect(epoch(t)).toBeLessThan(epoch('2024-01-21T00:00:00+09:00'))
    }
    expect(rise ?? set).not.toBeNull()
  })
})

describe('WBGT estimate', () => {
  it('applies the estimation formula', () => {
    // 0.735·30 + 0.0374·60 + 0.00292·30·60 + 7.619·0.8 − 4.557·0.64 − 0.0572·2 − 4.064
    expect(estimateWbgt(30, 60, 800, 2)).toBe(28.6)
    expect(estimateWbgt(null, 60, 800, 2)).toBeNull()
  })

  it('maps values to the guideline levels', () => {
    expect(wbgtLevel(31).ja).toBe('危険')
    expect(wbgtLevel(28.5).ja).toBe('厳重警戒')
    expect(wbgtLevel(25).ja).toBe('警戒')
    expect(wbgtLevel(22).ja).toBe('注意')
    expect(wbgtLevel(18).ja).toBe('ほぼ安全')
  })
})

describe('tide', () => {
  const points = Array.from({ length: 30 }, (_, i) => ({
    time: new Date(Date.UTC(2026, 9, 4, 0) + i * 3_600_000).toISOString(),
    level: Math.round(0.5 * Math.cos((2 * Math.PI * (i - 3.3)) / 12.42) * 100) / 100,
  }))

  it('finds high and low waters between the hours', () => {
    const turns = tideTurns(points)
    expect(turns[0]!.kind).toBe('high')
    expect(minutesBetween(points[3]!.time, turns[0]!.time)).toBeGreaterThan(0)
    expect(turns[0]!.level).toBeCloseTo(0.5, 1)
    expect(turns[1]!.kind).toBe('low')
    expect(turns[1]!.level).toBeCloseTo(-0.5, 1)
  })

  it('reads the level and trend at a time', () => {
    const r = tideAt(points, new Date(Date.UTC(2026, 9, 4, 6, 30)).toISOString())
    expect(r?.trend).toBe('falling')
  })
})

describe('climate normals', () => {
  // 30 years of a flat 20/10 °C climate with ±3 °C spread by year.
  const history: ClimateDay[] = []
  for (let y = 1991; y <= 2020; y++)
    for (let d = -10; d <= 10; d++)
      history.push({
        date: shiftDate(`${y}-10-04`, d),
        tmax: 20 + ((y % 7) - 3),
        tmin: 10 + ((y % 7) - 3),
        precip: y % 5 === 0 ? 10 : 0,
      })

  it('averages a ±7-day window across years', () => {
    const [n] = computeNormals(history, ['2026-10-04'])
    expect(n!.samples).toBe(30 * 15)
    expect(n!.tmax).toBeCloseTo(20, 0)
    expect(n!.precip).toBeCloseTo(2, 1)
    expect(n!.tmaxPct.p10).toBeLessThan(n!.tmaxPct.p90)
  })

  it('classifies against the percentiles', () => {
    const p = { p10: 17, p33: 19, p67: 21, p90: 23 }
    expect(classify(16, p)).toBe('much-below')
    expect(classify(20, p)).toBe('normal')
    expect(classify(22, p)).toBe('above')
    expect(classify(24, p)).toBe('much-above')
  })

  it('averages anomalies over known days only', () => {
    const normals = new Map([
      ['2026-10-04', 20],
      ['2026-10-05', 20],
    ])
    expect(
      meanAnomaly(
        [
          { date: '2026-10-04', value: 21 },
          { date: '2026-10-05', value: 23 },
          { date: '2026-10-06', value: 30 },
        ],
        normals,
      ),
    ).toBe(2)
  })

  it('fetches per week: Monday anchor, window covering a month back and 4 weeks ahead', () => {
    expect(weekAnchor('2026-10-04')).toBe('2026-09-28') // Sunday → previous Monday
    expect(weekAnchor('2026-10-05')).toBe('2026-10-05')
    expect(normalsWindow('2026-09-28')).toEqual({ from: '2026-08-28', to: '2026-10-26' })
  })
})
