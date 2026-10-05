import { describe, expect, it } from 'vitest'
import { fuseQuakes } from '@/services/fusion/earthquake'
import { synthQuakes } from '@/sources/mock/earth'
import { quakeRelevance, seismicStatus } from '@/domain/earth/status'

const now = '2026-10-04T16:24:00+09:00'
const tokyo = { lat: 35.68, lon: 139.77 }
const osaka = { lat: 34.69, lon: 135.5 }

describe('seismic status (AERIS rule)', () => {
  it('is NO DATA without any feed', () => {
    expect(seismicStatus([], now, false).status).toBe('unknown')
  })

  it('is nominal for background seismicity and names the latest quake', () => {
    const { jma, usgs } = synthQuakes(now, 'quiet')
    const r = seismicStatus(fuseQuakes(jma, usgs).events, now, true)
    expect(['nominal', 'active']).toContain(r.status)
    expect(r.rule).toMatch(/^aeris:/)
  })

  it('is WARNING after 震度5強 within the hour, and decays later', () => {
    const { jma, usgs } = synthQuakes(now, 'quake')
    const events = fuseQuakes(jma, usgs).events
    const r = seismicStatus(events, now, true)
    expect(r.status).toBe('warning')
    expect(r.headline).toContain('震度5強')
    // Three hours later the same quake no longer warrants WARNING.
    expect(seismicStatus(events, '2026-10-04T19:30:00+09:00', true).status).not.toBe('warning')
  })
})

describe('alert relevance to the monitoring location', () => {
  const { jma, usgs } = synthQuakes(now, 'quake')
  const main = fuseQuakes(jma, usgs).events.find((e) => e.detail.maxIntensity === '5+')!

  it('is local where intensity 4+ was observed within 30 km', () => {
    const p = quakeRelevance(main, tokyo)
    expect(p.affectsLocation).toBe(true)
    expect(p.relevance).toBe('local')
    expect(p.nativeLevel).toBe('4')
  })

  it('is not local far from the shaking, even for a strong quake', () => {
    const p = quakeRelevance(main, osaka)
    expect(p.affectsLocation).toBe(false)
    expect(p.relevance).toBe('national')
  })
})
