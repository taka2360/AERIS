import { describe, expect, it } from 'vitest'
import fixture from './fixtures/archive-tokyo-2020.json'
import { archiveSchema, archiveUrl, inYear, toClimateDays } from '.'

describe('openmeteo-archive', () => {
  it('validates and adapts a daily response', () => {
    const days = toClimateDays(archiveSchema.parse(fixture))
    expect(days).toHaveLength(7)
    expect(days[0]).toEqual({ date: '2020-09-27', tmax: 23.3, tmin: 17.7, precip: 3.9 })
  })

  it('maps 29 Feb to 28 Feb in common years', () => {
    expect(inYear('2024-02-29', 2021)).toBe('2021-02-28')
    expect(inYear('2024-02-29', 2020)).toBe('2020-02-29')
    expect(inYear('2026-10-04', 1991)).toBe('1991-10-04')
  })

  it('sends coordinates rounded to 0.01°', () => {
    const url = archiveUrl({ lat: 35.681234, lon: 139.767123 }, '2020-09-27', '2020-10-03')
    expect(url).toContain('latitude=35.68')
    expect(url).toContain('longitude=139.77')
    expect(url).not.toContain('35.6812')
  })
})
