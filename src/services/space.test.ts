import { describe, expect, it } from 'vitest'
import { spaceStatus } from '@/domain/earth/status'
import { synthSpaceWeather } from '@/sources/mock/earth'
import {
  adaptOvation,
  adaptSpaceWeather,
  ovationSchemaParse,
  parseAlert,
  utc,
} from '@/sources/swpc'
import alerts from '@/sources/swpc/fixtures/alerts.json'
import flares from '@/sources/swpc/fixtures/xray-flares-latest.json'
import kp from '@/sources/swpc/fixtures/noaa-planetary-k-index.json'
import kp1m from '@/sources/swpc/fixtures/planetary_k_index_1m.json'
import scales from '@/sources/swpc/fixtures/noaa-scales.json'
import propagated from '@/sources/swpc/fixtures/propagated-solar-wind-1-hour.json'
import ovation from '@/sources/swpc/fixtures/ovation-subset.json'
import { significant, spaceEvents } from './fusion/space'

const now = '2026-10-04T16:24:00+09:00'

describe('SWPC adapter (real products, 2026-10-04)', () => {
  const sw = adaptSpaceWeather({
    speed: [{ proton_speed: 520, time_tag: '2026-10-04T13:10:00Z' }],
    mag: [{ bt: 16, bz_gsm: -2, time_tag: '2026-10-04T13:10:00Z' }],
    propagated: propagated as Array<Array<string | number | null>>,
    kp,
    kp1m,
    flares,
    scales,
    alerts,
  })

  it('reads solar wind, Kp, X-ray and scales with UTC times converted to JST', () => {
    expect(utc('2026-10-04T13:10:00Z')).toBe('2026-10-04T22:10:00+09:00')
    expect(utc('2026-10-04 11:23:41.163')).toBe('2026-10-04T20:23:41+09:00')
    expect(sw.solarWind).toMatchObject({ speed: 520, bt: 16, bz: -2 })
    expect(sw.kp.estimated).toBeCloseTo(4.67)
    expect(sw.kp.series.at(-1)!.kp).toBe(5)
    expect(sw.xray.current).toBe('B2.0')
    expect(sw.scales.current).toEqual({ G: 0, S: 0, R: 0 })
    expect(sw.scales.predicted[0]!.G).toBe(1)
    expect(sw.windSeries.length).toBeGreaterThan(10)
  })

  it('parses alerts and keeps the newest per product', () => {
    const a = parseAlert(alerts[0]!)
    expect(a).toMatchObject({ productId: 'K05A', kind: 'ALERT', scale: 'G1' })
    expect(a.title).toContain('Geomagnetic K-index of 5')
    const ids = sw.alerts.map((x) => x.productId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('makes events only from significant statements', () => {
    expect(significant(parseAlert(alerts[0]!))).toBe(true)
    const events = spaceEvents(sw, {
      source: 'swpc',
      kind: 'observation',
      retrievedAt: now,
    })
    expect(events.every((e) => e.category === 'space-weather')).toBe(true)
    expect(events.find((e) => e.detail.productId === 'K05A')?.detail.kind).toBe('geomagnetic-storm')
  })

  it('normalises OVATION longitudes (0–359) and drops low probabilities', () => {
    const g = adaptOvation(ovationSchemaParse(ovation))
    expect(g.cells.every(([lon]) => lon >= -180 && lon < 180)).toBe(true)
    expect(g.cells.every(([, , p]) => p >= 5)).toBe(true)
  })
})

describe('space status', () => {
  it('follows NOAA scales, with Kp 5+ as at least ACTIVE', () => {
    expect(spaceStatus(synthSpaceWeather(now, 'quiet'), true).status).toBe('nominal')
    const storm = spaceStatus(synthSpaceWeather(now, 'geomag'), true)
    expect(storm.status).toBe('elevated')
    expect(storm.headline).toContain('G3')
    expect(storm.headline).toContain('(EST)')
    expect(spaceStatus(null, false).status).toBe('unknown')
  })
})
