import { describe, expect, it } from 'vitest'
import { airIndex } from '@/domain/earth/air'
import { airStatus, oceanStatus, snowStatus } from '@/domain/earth/status'
import { adaptAir, airSchema } from '@/sources/openmeteo-air'
import airFixture from '@/sources/openmeteo-air/fixtures/air-tokyo.json'
import { adaptGrid, adaptMarine, marineSchema } from '@/sources/openmeteo-marine'
import marineFixture from '@/sources/openmeteo-marine/fixtures/marine-tokyo.json'

const now = '2026-10-04T22:00:00+09:00'
const tokyo = { lat: 35.68, lon: 139.77 }

describe('CAMS air quality (real response, Tokyo 2026-10-04 22:00)', () => {
  const a = adaptAir(airSchema.parse(airFixture), now, now)

  it('keeps every pollutant as a MODEL value with its unit', () => {
    expect(a.current.pm2_5).toBeCloseTo(26.6)
    expect(a.units.pm2_5).toBe('μg/m³')
    expect(a.series.provenance).toMatchObject({ kind: 'model', derivation: 'modeled' })
    expect(a.series.points.some((p) => p.role === 'forecast')).toBe(true)
  })

  it('rates PM2.5 26.6 as MODERATE on the AERIS index', () => {
    expect(airIndex(a.current)).toMatchObject({ scheme: 'aeris', level: 'moderate' })
  })

  it('takes the worst pollutant and labels the rule', () => {
    expect(airIndex({ pm2_5: 10, ozone: 250 })).toMatchObject({
      level: 'critical',
      driver: 'ozone',
    })
    expect(airIndex({})).toBeNull()
    expect(airStatus(airIndex({ pm2_5: 50 }), true)).toMatchObject({ status: 'elevated' })
    expect(airStatus(null, false).status).toBe('unknown')
  })
})

describe('marine model (real response, Tokyo Bay cell)', () => {
  const m = adaptMarine(marineSchema.parse(marineFixture), tokyo, now, now)

  it('reports the cell distance and MODEL provenance', () => {
    expect(m.cellDistanceKm).toBeGreaterThan(0)
    expect(m.cellDistanceKm).toBeLessThan(20)
    expect(m.series.provenance.derivation).toBe('modeled')
    expect(m.current.wave_height).toBeCloseTo(0.22)
  })

  it('treats land cells in the grid as missing, not calm', () => {
    const g = adaptGrid([
      {
        latitude: 36,
        longitude: 138,
        utc_offset_seconds: 0,
        current: {
          time: '2026-10-04T13:00',
          wave_height: null,
          wave_direction: null,
          sea_surface_temperature: null,
        },
      },
      {
        latitude: 30,
        longitude: 140,
        utc_offset_seconds: 0,
        current: {
          time: '2026-10-04T13:00',
          wave_height: 3.6,
          wave_direction: 67,
          sea_surface_temperature: 28,
        },
      },
    ])
    expect(g.cells).toHaveLength(1)
    expect(g.at).toBe('2026-10-04T22:00:00+09:00')
  })

  it('rates ocean state by wave height', () => {
    expect([1, 3, 4.5, 7].map((h) => oceanStatus(h, null, true).status)).toEqual([
      'nominal',
      'active',
      'elevated',
      'warning',
    ])
  })
})

describe('snow status', () => {
  it('rates snowfall and depth, and says the values are estimates', () => {
    expect(snowStatus(null, null, true)).toMatchObject({ status: 'nominal' })
    expect(snowStatus(null, 20, true).status).toBe('warning')
    expect(snowStatus(100, 0, true).status).toBe('elevated')
    expect(snowStatus(50, null, true).headline).toContain('(EST)')
  })
})
