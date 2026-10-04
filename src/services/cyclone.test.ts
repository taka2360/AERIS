import { describe, expect, it } from 'vitest'
import { cycloneStatus } from '@/domain/earth/status'
import { cyclonePositionAt } from '@/domain/earth/temporal'
import { adaptCyclone, forecastSchema, specSchema, targetSchema } from '@/sources/jma-typhoon'
import fc from '@/sources/jma-typhoon/fixtures/forecast-TC2633.json'
import spec from '@/sources/jma-typhoon/fixtures/specifications-TC2633.json'
import target from '@/sources/jma-typhoon/fixtures/targetTc.json'
import { synthCyclones } from '@/sources/mock/earth'
import { cycloneEvent, typhoonTitle } from './fusion/cyclone'

const tokyo = { lat: 35.68, lon: 139.77 }

describe('jma-typhoon adapter (real issuance, 台風第27号 2026-10-04 18:45)', () => {
  const r = adaptCyclone('TC2633', forecastSchema.parse(fc), specSchema.parse(spec))

  it('reads the analysis with its specifications', () => {
    expect(targetSchema.parse(target)[0]!.tropicalCyclone).toBe('TC2633')
    expect(typhoonTitle(r)).toBe('台風第27号 チョーイワン')
    expect(r.detail.observedPosition).toMatchObject({
      lat: 23.1,
      lon: 146.9,
      pressureHpa: 935,
      maxWindMs: 45,
      stormAreaKm: 165,
      role: 'analysis',
    })
    expect(r.detail.intensityClass).toBe('非常に強い')
    expect(r.detail.sizeClass).toBe('大型')
    expect(r.detail.galeArea?.radiusKm).toBe(741)
  })

  it('keeps one issuance with forecast circles and an untimed past path', () => {
    const issue = r.detail.forecasts[0]!
    expect(r.detail.forecasts).toHaveLength(1)
    expect(issue.issuedAt).toBe('2026-10-04T18:45:00+09:00')
    expect(issue.points.filter((p) => p.role === 'forecast').map((p) => p.circleKm)).toEqual([
      65, 93, 157, 222,
    ])
    expect(r.detail.observedPath!.length).toBeGreaterThan(10)
    expect(r.detail.observedTrack).toEqual([]) // no times → never interpolated
  })

  it('places the centre only where JMA stated it', () => {
    const d = r.detail
    const mid = cyclonePositionAt([], d.forecasts, '2026-10-05T00:00:00+09:00')!
    expect(mid.role).toBe('forecast')
    expect(mid.lat).toBeGreaterThan(23.1)
    expect(mid.lat).toBeLessThan(24.8)
    // Before the analysis time there is no timed track: NO DATA.
    expect(cyclonePositionAt([], d.forecasts, '2026-10-04T12:00:00+09:00')).toBeNull()
  })
})

describe('cyclone status (AERIS rule)', () => {
  const now = '2026-10-04T16:24:00+09:00'

  it('is NOMINAL with no cyclones, ACTIVE for a distant one', () => {
    expect(cycloneStatus([], tokyo, true).status).toBe('nominal')
    const far = synthCyclones(now, 'quiet').map(cycloneEvent)
    expect(cycloneStatus(far, tokyo, true).status).toBe('active')
  })

  it('is WARNING when the location is in the gale or forecast storm area', () => {
    const near = synthCyclones(now, 'typhoon').map(cycloneEvent)
    const r = cycloneStatus(near, tokyo, true)
    expect(r.status).toBe('warning')
    expect(r.headline).toContain('監視地点まで')
  })
})
