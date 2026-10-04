import { describe, expect, it } from 'vitest'
import {
  activeTsunami,
  nearbyAreaCodes,
  tsunamiRelevance,
  tsunamiStatus,
} from '@/domain/earth/status'
import {
  adaptAreas,
  adaptBulletins,
  areasSchema,
  detailSchema,
  listSchema,
  reportObservation,
  tsunamiKindRank,
} from '@/sources/jma-tsunami'
import detailFixture from '@/sources/jma-tsunami/fixtures/detail-VTSE41.json'
import listFixture from '@/sources/jma-tsunami/fixtures/list.json'
import areasFixture from '@/sources/jma-tsunami/fixtures/areas-subset.json'
import { synthQuakes, synthTsunami } from '@/sources/mock/earth'
import { fuseQuakes } from './fusion/earthquake'
import { fuseTsunami, tsunamiAssessments } from './fusion/tsunami'

const retrievedAt = '2026-09-30T14:20:00+09:00'
const tokyo = { lat: 35.68, lon: 139.77 }
const osaka = { lat: 34.69, lon: 135.5 }

describe('jma-tsunami adapter (real bulletin, 2026-09-30 与那国島近海)', () => {
  const report = adaptBulletins('20260930140037', [detailSchema.parse(detailFixture)])

  it('validates the list and reads the forecast item', () => {
    expect(listSchema.parse(listFixture)).toHaveLength(1)
    expect(report.forecasts).toEqual([
      expect.objectContaining({
        areaCode: '802',
        areaName: '宮古島・八重山地方',
        kindCode: '71',
        maxHeight: '<0.2',
      }),
    ])
    expect(report.validUntil).toBe('2026-09-30T18:00:00+09:00')
    expect(report.origin).toMatchObject({ areaName: '与那国島近海', lat: 23.8, magnitude: 6 })
  })

  it('turns a 予報 into an ACTIVE assessment valid until its end time', () => {
    const a = tsunamiAssessments(reportObservation(report, retrievedAt))
    expect(a[0]).toMatchObject({ scheme: 'jma-tsunami', rank: 1, status: 'issued' })
    expect(a[0]!.time.validUntil).toBe('2026-09-30T18:00:00+09:00')
    expect(tsunamiStatus(a, '2026-09-30T15:00:00+09:00', true).status).toBe('active')
    // After ValidDateTime the forecast no longer counts.
    expect(tsunamiStatus(a, '2026-09-30T19:00:00+09:00', true).status).toBe('nominal')
  })

  it('ranks JMA kinds', () => {
    expect(['53', '51', '62', '71', '50', '00'].map(tsunamiKindRank)).toEqual([4, 3, 2, 1, 0, 0])
  })
})

describe('tsunami status and relevance', () => {
  const now = '2026-10-04T16:24:00+09:00'
  const areas = adaptAreas(areasSchema.parse(areasFixture))

  it('is NOMINAL with no bulletins and NO DATA without a feed', () => {
    expect(tsunamiStatus([], now, true)).toMatchObject({
      status: 'nominal',
      headline: '津波の発表なし',
    })
    expect(tsunamiStatus([], now, false).status).toBe('unknown')
  })

  it('finds the coasts near a location from the forecast-area coastlines', () => {
    expect(nearbyAreaCodes(areas, tokyo)[0]).toBe('312') // 東京湾内湾
    expect(nearbyAreaCodes(areas, { lat: 36.3, lon: 138.2 })).toEqual([]) // inland (Nagano)
  })

  it('scenario: WARNING overall; the Tokyo coast gets its own advisory', () => {
    const { jma, usgs } = synthQuakes(now, 'tsunami')
    const quakes = fuseQuakes(jma, usgs).events
    const { events, assessments } = fuseTsunami(synthTsunami(now, 'tsunami'), quakes)
    expect(tsunamiStatus(assessments, now, true).status).toBe('warning')
    const active = activeTsunami(assessments, now)
    const tokyoRel = tsunamiRelevance(active, nearbyAreaCodes(areas, tokyo))
    expect(tokyoRel.local.map((a) => a.level.label)).toEqual(['津波注意報'])
    expect(tsunamiRelevance(active, nearbyAreaCodes(areas, osaka)).local).toEqual([])
    // The tsunami links to (not merges with) its earthquake.
    expect(events[0]!.related?.[0]).toMatchObject({ relation: 'triggered-by' })
    expect(events[0]!.lifecycle).toBe('ongoing')
  })
})
