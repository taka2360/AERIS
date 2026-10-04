import { describe, expect, it } from 'vitest'
import { severeStatus } from '@/domain/earth/status'
import type { AlertBulletin } from '@/domain/model'
import { adaptInformation, classifyTitle, listSchema } from '@/sources/jma-information'
import fixture from '@/sources/jma-information/fixtures/information.json'
import { synthInformation } from '@/sources/mock/earth'

const now = '2026-10-04T16:24:00+09:00'

describe('jma-information adapter (real list, 2026-10-04)', () => {
  it('classifies phenomena from JMA headlines', () => {
    expect(classifyTitle('東京都気象解説情報（大雨・落雷・突風）')).toEqual({
      phenomena: ['大雨', '落雷', '突風'],
      rank: 2,
    })
    expect(classifyTitle('顕著な大雨に関する関東甲信地方気象情報').rank).toBe(3)
    expect(classifyTitle('少雨に関する九州北部地方（山口県を含む）気象情報').rank).toBe(1)
  })

  it('keeps the newest report per bulletin series with its validity', () => {
    const a = adaptInformation(listSchema.parse(fixture), now)
    expect(a.length).toBeGreaterThan(0)
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length)
    expect(a.every((x) => x.scheme === 'jma-information' && x.provenance.kind === 'official')).toBe(
      true,
    )
  })
})

describe('severe weather status (AERIS rule)', () => {
  const bulletin = (severity: 'warning' | 'emergency'): AlertBulletin => ({
    areaName: '東京都千代田区',
    alerts: [
      {
        id: 'x',
        phenomenon: '大雨',
        name: severity === 'emergency' ? '大雨特別警報' : '大雨警報',
        severity,
        status: 'issued',
      },
    ],
    provenance: { source: 'jma-warning', kind: 'official', retrievedAt: now },
  })

  it('escalates with the location’s own warnings', () => {
    expect(severeStatus(bulletin('warning'), [], '130000', now, true).status).toBe('elevated')
    expect(severeStatus(bulletin('emergency'), [], '130000', now, true).status).toBe('critical')
  })

  it('counts weather information for the location’s prefecture more than elsewhere', () => {
    const storm = synthInformation(now, 'storm')
    expect(severeStatus(undefined, storm, '130000', now, true).status).toBe('elevated')
    expect(severeStatus(undefined, storm, '270000', now, true).status).toBe('active')
    expect(
      severeStatus(undefined, synthInformation(now, 'quiet'), '130000', now, true),
    ).toMatchObject({
      status: 'nominal',
      headline: '顕著な現象の発表なし',
    })
  })
})
