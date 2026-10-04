import { describe, expect, it } from 'vitest'
import { pollInterval } from '@/services/poll-policy'
import { renderDataSourcesMarkdown } from './registry-doc'
import { SOURCES, sourceSpec } from './registry'
import dataSourcesDoc from '../../docs/DATA_SOURCES.md?raw'

const now = '2026-10-04T18:00:00+09:00'

describe('source registry', () => {
  it('has unique ids and complete contracts', () => {
    const ids = SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SOURCES) {
      expect(s.license, s.id).not.toBe('')
      expect(s.attribution.text, s.id).not.toBe('')
      expect(s.freshness.staleAfterMin, s.id).toBeGreaterThan(0)
      // Sources behind the relay must not be marked browser-reachable.
      if (s.apiKey === 'relay-secret') expect(s.cors, s.id).toBe(false)
    }
  })

  it('marks model sources as modeled, never measured', () => {
    for (const id of ['openmeteo', 'openmeteo-marine', 'openmeteo-air', 'openmeteo-flood'] as const)
      expect(sourceSpec(id)?.derivation).toBe('modeled')
  })

  it('keeps docs/DATA_SOURCES.md in sync (run `pnpm docs:sources`)', () => {
    expect(dataSourcesDoc).toBe(renderDataSourcesMarkdown(SOURCES))
  })
})

describe('adaptive polling', () => {
  const tsunami = sourceSpec('jma-tsunami')!
  const quake = sourceSpec('jma-quake')!

  it('polls at the nominal rate in quiet conditions', () => {
    expect(pollInterval(tsunami, {}, now)).toBe(tsunami.poll.nominalMs)
    expect(pollInterval(quake, {}, now)).toBe(quake.poll.nominalMs)
  })

  it('speeds up while a tsunami warning is in force', () => {
    expect(pollInterval(tsunami, { tsunamiMaxRank: 3 }, now)).toBe(30_000)
    expect(pollInterval(tsunami, { tsunamiMaxRank: 1 }, now)).toBe(tsunami.poll.nominalMs)
  })

  it('speeds up only shortly after a strong earthquake', () => {
    const recent = { latestQuake: { intensityRank: 5, at: '2026-10-04T17:40:00+09:00' } }
    const old = { latestQuake: { intensityRank: 5, at: '2026-10-04T15:00:00+09:00' } }
    const weak = { latestQuake: { intensityRank: 1, at: '2026-10-04T17:55:00+09:00' } }
    expect(pollInterval(quake, recent, now)).toBe(30_000)
    expect(pollInterval(quake, old, now)).toBe(quake.poll.nominalMs)
    expect(pollInterval(quake, weak, now)).toBe(quake.poll.nominalMs)
  })

  it('disables polling for static resources', () => {
    expect(pollInterval(sourceSpec('basemap')!, {}, now)).toBe(false)
  })
})
