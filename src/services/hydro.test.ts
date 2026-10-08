import { describe, expect, it } from 'vitest'
import { groundStatus, hydroStatus } from '@/domain/earth/status'
import { dischargeSummary } from '@/query/earth-hooks'
import { buildKikikuru, targetTimesSchema } from '@/sources/jma-tile'
import riskTimes from '@/sources/jma-tile/fixtures/risk_targetTimes.json'
import { adaptFlood, floodSchema } from '@/sources/openmeteo-flood'
import floodFixture from '@/sources/openmeteo-flood/fixtures/flood-tokyo.json'
import { synthRiver } from '@/sources/mock/earth'

const now = '2026-10-04T18:00:00+09:00'

describe('GloFAS adapter (real response, Tokyo cell)', () => {
  const s = adaptFlood(floodSchema.parse(floodFixture), now, now)

  it('is MODELED throughout: past days analysis, today onwards forecast', () => {
    expect(s.derivation).toBe('modeled')
    expect(s.provenance.kind).toBe('model')
    const today = s.points.find((p) => p.time.startsWith('2026-10-04'))!
    expect(today.role).toBe('forecast')
    expect(s.points.find((p) => p.time.startsWith('2026-10-03'))!.role).toBe('analysis')
    expect(today.values.discharge).toBeCloseTo(164.2)
  })

  it('summarises today and the forecast peak', () => {
    const sum = dischargeSummary(s.points, now)
    expect(sum.today).toBeCloseTo(164.2)
    expect(sum.peakAt?.startsWith('2026-10-04')).toBe(true)
  })
})

describe('キキクル series', () => {
  it('derives the flood vector-tile frames from the same time list', () => {
    const k = buildKikikuru(targetTimesSchema.parse(riskTimes), now)
    expect(k.flood.frames).toHaveLength(k.land.frames.length)
    expect(k.flood.frames[0]!.tileUrlTemplate).toMatch(/\/surf\/flood\/\{z\}\/\{x\}\/\{y\}\.pbf$/)
    expect(k.inundation.provenance.sourceRole).toBe('assessment')
  })
})

describe('hydro / ground status (AERIS rule)', () => {
  it('follows キキクル levels', () => {
    expect([1, 2, 3, 4, 5].map((l) => groundStatus(l, true).status)).toEqual([
      'nominal',
      'active',
      'elevated',
      'warning',
      'critical',
    ])
    expect(groundStatus(3, true).headline).toBe('土砂キキクル 警戒')
  })

  it('lets modeled discharge add context but never a warning', () => {
    const storm = dischargeSummary(synthRiver(now, 'storm').points, now)
    const inund = (l: number | null) => ({ flood: null, inundation: l })
    // Storm peak 480 vs today 351: below twice today, so no change.
    expect(hydroStatus(inund(1), storm, true).status).toBe('nominal')
    expect(hydroStatus(inund(1), { today: 100, peak: 1000 }, true).status).toBe('active')
    expect(hydroStatus(inund(4), storm, true).status).toBe('warning')
    expect(hydroStatus(inund(null), null, false).status).toBe('unknown')
  })

  it('takes the worse of 洪水 and 浸水 キキクル', () => {
    const r = hydroStatus({ flood: 4, inundation: 2 }, null, true)
    expect(r.status).toBe('warning')
    expect(r.headline).toBe('洪水キキクル 危険 · 浸水キキクル 注意')
    expect(hydroStatus({ flood: 1, inundation: 1 }, null, true).headline).toBe(
      '洪水・浸水キキクル 危険度なし',
    )
  })
})
