import { describe, expect, it } from 'vitest'
import { volcanoStatus } from '@/domain/earth/status'
import { volcanoRank } from '@/domain/earth/reports'
import { adaptSites, adaptWarnings, listSchema, warningSchema } from '@/sources/jma-volcano'
import listFixture from '@/sources/jma-volcano/fixtures/volcano_list.json'
import warningFixture from '@/sources/jma-volcano/fixtures/warning.json'
import { synthVolcanoes } from '@/sources/mock/earth'
import { fuseVolcanoes } from './fusion/volcano'

const now = '2026-10-04T16:24:00+09:00'
const tokyo = { lat: 35.68, lon: 139.77 }

describe('jma-volcano adapter (real data, 2026-10-04)', () => {
  const sites = adaptSites(listSchema.parse(listFixture))
  const reports = adaptWarnings(warningSchema.parse(warningFixture), sites)

  it('reads the catalogue with coordinates, skipping aggregate entries', () => {
    expect(sites.length).toBeGreaterThan(100)
    expect(sites.every((v) => Number.isFinite(v.lat))).toBe(true)
    expect(sites.find((v) => v.code === '900')).toBeUndefined()
    expect(sites.find((v) => v.code === '506')).toMatchObject({ name: '桜島', lat: 31.593 })
  })

  it('keeps JMA wording and change, never inventing levels for unlisted volcanoes', () => {
    const tokachi = reports.find((r) => r.site.code === '108')!
    expect(tokachi).toMatchObject({
      levelCode: '13',
      levelName: 'レベル３（入山規制）',
      condition: '引上げ',
    })
    expect(reports.find((r) => r.site.code === '306')).toBeUndefined() // 浅間山: not listed
  })

  it('ranks JMA codes', () => {
    expect(['15', '14', '13', '12', '11', '21', '22', '36'].map(volcanoRank)).toEqual([
      5, 4, 3, 2, 1, 4, 2, 2,
    ])
  })
})

describe('volcano status (AERIS rule)', () => {
  it('is ELEVATED with level-3 volcanoes listed (real bulletins)', () => {
    const feed = synthVolcanoes(now, 'quiet')
    const { assessments } = fuseVolcanoes(feed.reports)
    const r = volcanoStatus(assessments, feed.sites, tokyo, true)
    expect(r.status).toBe('elevated')
    expect(r.headline).toContain('レベル３')
  })

  it('is WARNING for a level-4 eruption warning', () => {
    const feed = synthVolcanoes(now, 'eruption')
    const { assessments, events } = fuseVolcanoes(feed.reports)
    const r = volcanoStatus(assessments, feed.sites, tokyo, true)
    expect(r.status).toBe('warning')
    expect(r.headline).toContain('桜島')
    expect(events.find((e) => e.id === r.eventId)?.detail.alertLevel).toBe(4)
  })

  it('is NO DATA without the feed', () => {
    expect(volcanoStatus([], [], tokyo, false).status).toBe('unknown')
  })
})
