/**
 * Adapter tests against real responses captured on 2026-10-04 (trimmed).
 * They pin both the schema (does the real payload validate?) and the mapping.
 */
import { describe, expect, it } from 'vitest'
import { mapSchema, tableSchema, adaptStations, mapKey } from './jma-amedas'
import { areaSchema, class20Candidates, resolveArea } from './jma-area'
import { adaptOfficial, forecastSchema as jmaForecastSchema } from './jma-forecast'
import { adaptFrames, targetTimesSchema, utcStampToInstant } from './jma-nowcast'
import { adaptWarnings, warningSchema } from './jma-warning'
import { KINDS } from './jma-warning/kinds'
import { adaptForecast, localToInstant, wmoToCondition } from './openmeteo-forecast/adapter'
import { forecastSchema } from './openmeteo-forecast/schema'
import omFixture from './openmeteo-forecast/fixtures/forecast-tokyo.json'
import amedasTable from './jma-amedas/fixtures/amedastable-kanto.json'
import amedasMap from './jma-amedas/fixtures/map-kanto.json'
import areaFixture from './jma-area/fixtures/area-subset.json'
import jmaForecast from './jma-forecast/fixtures/forecast-130000.json'
import warningFixture from './jma-warning/fixtures/warning-r8-130000.json'
import n1 from './jma-nowcast/fixtures/targetTimes_N1.json'
import n2 from './jma-nowcast/fixtures/targetTimes_N2.json'

const retrievedAt = '2026-10-04T17:16:00+09:00'

describe('open-meteo forecast', () => {
  const parsed = forecastSchema.parse(omFixture)
  const f = adaptForecast(parsed, retrievedAt)

  it('attaches the JST offset to local times', () => {
    expect(localToInstant('2026-10-04T17:15', 32400)).toBe('2026-10-04T17:15:00+09:00')
    expect(f.hourly.points[0]!.time).toBe('2026-10-03T00:00:00+09:00')
  })

  it('maps current values with model provenance and converts visibility to km', () => {
    expect(f.current.temperature).toMatchObject({ value: 20.6, provenance: { kind: 'model' } })
    expect(f.current.visibility?.value).toBeCloseTo(34.2, 1)
    expect(f.current.condition?.value).toBe('partly-cloudy')
  })

  it('starts the outlook today (drops past_days) and keeps 7 days', () => {
    expect(f.daily.days[0]!.date).toBe('2026-10-04')
    expect(f.daily.days).toHaveLength(7)
    expect(f.daily.days[0]!.sunset).toBe('2026-10-04T17:21:00+09:00')
  })

  it('maps WMO codes', () => {
    expect(wmoToCondition(0)).toBe('clear')
    expect(wmoToCondition(65)).toBe('heavy-rain')
    expect(wmoToCondition(95)).toBe('thunder')
    expect(wmoToCondition(null)).toBe('unknown')
  })
})

describe('jma amedas', () => {
  const table = tableSchema.parse(amedasTable)
  const map = mapSchema.parse(amedasMap)
  const stations = adaptStations(table, map, '2026-10-04T17:00:00+09:00', {
    lat: 35.68,
    lon: 139.77,
  })

  it('builds the snapshot key from latest_time', () => {
    expect(mapKey('2026-10-04T17:00:00+09:00')).toBe('20261004170000')
  })

  it('returns nearby stations sorted by distance with decoded units', () => {
    const tokyo = stations[0]!
    expect(tokyo).toMatchObject({
      id: '44132',
      name: '東京',
      temperature: 20.7,
      humidity: 61,
      pressure: 1016.5,
    })
    expect(tokyo.distanceKm).toBeLessThan(3)
    expect(tokyo.windDirection).toBe(22.5) // code 1 = NNE
    expect(tokyo.sunshine1h).toBe(0)
    for (let i = 1; i < stations.length; i++) {
      expect(stations[i]!.distanceKm).toBeGreaterThanOrEqual(stations[i - 1]!.distanceKm)
    }
  })

  it('leaves unobserved elements null (rain-gauge-only stations)', () => {
    expect(stations.some((s) => s.temperature == null && s.precipitation1h != null)).toBe(true)
  })
})

describe('jma area', () => {
  const area = areaSchema.parse(areaFixture)

  it('resolves a Tokyo ward through class15/class10 to the office', () => {
    expect(resolveArea(area, '13101')).toMatchObject({
      class20: '1310100',
      class20Name: '千代田区',
      class10: '130010',
      office: '130000',
    })
  })

  it('maps designated-city wards to the city entry', () => {
    expect(class20Candidates('01101')).toEqual(['0110100', '0110000'])
    expect(resolveArea(area, '01101')).toMatchObject({ class20: '0110000', class20Name: '札幌市' })
    expect(resolveArea(area, '27127')?.class20Name).toBe('大阪市')
  })

  it('returns null for unknown codes', () => {
    expect(resolveArea(area, '99999')).toBeNull()
  })
})

describe('jma official forecast', () => {
  it('extracts the class10 text and normalises full-width spaces', () => {
    const f = adaptOfficial(jmaForecastSchema.parse(jmaForecast), '130010', retrievedAt)!
    expect(f.areaName).toBe('東京地方')
    expect(f.weather).toBe('くもり')
    expect(f.wind).toBe('北東の風 後 北の風')
    expect(f.provenance).toMatchObject({ kind: 'official', issuedAt: '2026-10-04T17:00:00+09:00' })
  })
})

describe('jma warnings (r8)', () => {
  const r = warningSchema.parse(warningFixture)

  it('names kinds per the 2026 system', () => {
    expect(KINDS['03']).toMatchObject({ name: 'レベル３大雨警報', severity: 'warning', level: 3 })
    expect(KINDS['43']).toMatchObject({
      name: 'レベル４大雨危険警報',
      severity: 'danger',
      level: 4,
    })
    expect(KINDS['33']?.severity).toBe('emergency')
    expect(KINDS['15']).toMatchObject({
      name: '強風注意報',
      severity: 'advisory',
      level: undefined,
    })
    expect(KINDS['29']?.name).toBe('レベル２土砂災害注意報')
  })

  it('merges bulletins for one area, warnings ranked first', () => {
    const b = adaptWarnings(r, '1342100', '小笠原村', retrievedAt)
    expect(b.alerts.map((a) => [a.name, a.status])).toEqual([
      ['波浪警報', 'issued'],
      ['強風注意報', 'continued'],
      ['雷注意報', 'cancelled'],
    ])
    // headline comes from the wave-warning bulletin, not the newer wind one
    expect(b.headline).toContain('高波')
    expect(b.provenance.issuedAt).toBe('2026-10-04T15:53:00+09:00')
  })

  it('reports nothing active for an area with no warnings', () => {
    const b = adaptWarnings(r, '1310100', '千代田区', retrievedAt)
    expect(b.alerts.filter((a) => a.status !== 'cancelled')).toEqual([])
  })
})

describe('jma nowcast', () => {
  it('converts UTC stamps and orders observed then forecast frames', () => {
    expect(utcStampToInstant('20261004081500')).toBe('2026-10-04T17:15:00+09:00')
    const frames = adaptFrames(targetTimesSchema.parse(n1), targetTimesSchema.parse(n2))
    const firstForecast = frames.findIndex((f) => f.kind === 'forecast')
    expect(firstForecast).toBeGreaterThan(0)
    expect(frames.slice(firstForecast).every((f) => f.kind === 'forecast')).toBe(true)
    expect(frames[0]!.tileUrlTemplate).toMatch(/\/surf\/hrpns\/\{z\}\/\{x\}\/\{y\}\.png$/)
  })
})
