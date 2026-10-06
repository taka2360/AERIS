import { describe, expect, it } from 'vitest'
import { compass16, deriveAerisStatus, dewPointC, pressureTendency } from './derive'
import { aggregateStatus, linkStatusOf, type SourceHealth } from './health'
import type { HourlyPoint, Provenance } from './model'
import { addMinutes, formatTime, jstDateKey, toInstant } from './time'

const prov: Provenance = { source: 'mock', kind: 'model', retrievedAt: '2026-10-04T12:00:00+09:00' }

function hour(time: string, over: Partial<HourlyPoint> = {}): HourlyPoint {
  return {
    time,
    temperature: 20,
    apparentTemperature: 20,
    humidity: 60,
    dewPoint: 12,
    pressure: 1012,
    precipitation: 0,
    precipitationProbability: 0,
    windSpeed: 3,
    windDirection: 0,
    gust: 5,
    cloudCover: 30,
    visibility: 20,
    uvIndex: 2,
    solarRadiation: 450,
    condition: 'mostly-clear',
    ...over,
  }
}

describe('time', () => {
  it('serializes to JST regardless of the host time zone', () => {
    expect(toInstant(Date.UTC(2026, 9, 3, 15, 30, 0))).toBe('2026-10-04T00:30:00+09:00')
  })
  it('uses the JST calendar date at day boundaries', () => {
    // 23:30 UTC on Oct 3 is already Oct 4 in Japan.
    expect(jstDateKey('2026-10-03T23:30:00Z')).toBe('2026-10-04')
    expect(formatTime('2026-10-03T23:30:00Z', false)).toBe('08:30')
  })
  it('adds minutes', () => {
    expect(addMinutes('2026-10-04T23:50:00+09:00', 20)).toBe('2026-10-05T00:10:00+09:00')
  })
})

describe('derive', () => {
  it('maps degrees to 16-point compass', () => {
    expect(compass16(0)).toBe('N')
    expect(compass16(45)).toBe('NE')
    expect(compass16(359)).toBe('N')
    expect(compass16(-90)).toBe('W')
  })

  it('computes dew point (Magnus)', () => {
    expect(dewPointC(25, 60)).toBeCloseTo(16.7, 0)
  })

  it('reports a falling pressure tendency over 3h', () => {
    const pts = [0, 1, 2, 3].map((i) =>
      hour(addMinutes('2026-10-04T09:00:00+09:00', i * 60), { pressure: 1012 - i * 1.5 }),
    )
    const t = pressureTendency(pts, '2026-10-04T12:10:00+09:00')
    expect(t).toEqual({ trend: 'falling', delta: -4.5, windowHours: 3 })
  })

  it('is nominal with benign conditions', () => {
    const s = deriveAerisStatus({
      current: {
        temperature: { value: 22, provenance: prov },
        gust: { value: 6, provenance: prov },
      },
      hourly: [],
      now: '2026-10-04T12:00:00+09:00',
    })
    expect(s).toEqual({ level: 'nominal', reasons: [] })
  })

  it('explains why it raised caution / alert, alert first', () => {
    const now = '2026-10-04T12:00:00+09:00'
    const s = deriveAerisStatus({
      current: {
        gust: { value: 26, provenance: prov },
        visibility: { value: 1.5, provenance: prov },
      },
      hourly: [hour(addMinutes(now, 60), { precipitation: 12 })],
      now,
    })
    expect(s.level).toBe('alert')
    expect(s.reasons.map((r) => [r.code, r.level])).toEqual([
      ['HIGH_GUST', 'alert'],
      ['PRECIP_INBOUND', 'caution'],
      ['LOW_VISIBILITY', 'caution'],
    ])
  })
})

describe('health', () => {
  const base: SourceHealth = {
    source: 'openmeteo',
    connectivity: 'online',
    freshness: 'fresh',
    validity: 'valid',
    fetching: false,
  }
  it('separates connectivity from freshness', () => {
    expect(linkStatusOf(base)).toBe('online')
    expect(linkStatusOf({ ...base, freshness: 'stale' })).toBe('stale')
    expect(linkStatusOf({ ...base, connectivity: 'offline' })).toBe('stale') // cached data shown
    expect(linkStatusOf({ ...base, connectivity: 'offline', freshness: 'none' })).toBe('offline')
    expect(linkStatusOf({ ...base, validity: 'invalid' })).toBe('degraded')
  })
  it('degrades when an auxiliary source fails, goes offline when all critical fail', () => {
    const warn: SourceHealth = {
      ...base,
      source: 'jma-warning',
      connectivity: 'offline',
      freshness: 'none',
    }
    expect(aggregateStatus([base, warn], ['openmeteo'])).toBe('degraded')
    const deadModel: SourceHealth = { ...base, connectivity: 'offline', freshness: 'none' }
    expect(aggregateStatus([deadModel, warn], ['openmeteo'])).toBe('offline')
  })
  it('ignores auxiliary channels that are still loading', () => {
    const map: SourceHealth = {
      ...base,
      source: 'basemap',
      connectivity: 'unknown',
      freshness: 'none',
      fetching: true,
    }
    expect(aggregateStatus([base, map], ['openmeteo'])).toBe('online')
  })
})
