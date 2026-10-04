/**
 * Vertical slice: real JMA + USGS payloads (captured 2026-10-04) through
 * association → canonical earthquakes. Pins the field policy, the evidence
 * trail and provenance preservation, plus property tests on synthetic data.
 */
import { describe, expect, it } from 'vitest'
import type { SourceObservation } from '@/domain/earth/common'
import { normalizeLon, splitAtAntimeridian } from '@/domain/earth/common'
import { intensityRank, quakeSeverity } from '@/domain/earth/derive'
import type { QuakeSolution } from '@/domain/earth/reports'
import { toInstant } from '@/domain/time'
import {
  adaptDetail,
  adaptList,
  detailSchema,
  listSchema,
  parseCoordinate,
} from '@/sources/jma-quake'
import jmaList from '@/sources/jma-quake/fixtures/list.json'
import jmaDetail from '@/sources/jma-quake/fixtures/detail-VXSE5k.json'
import { adaptFeed, feedSchema } from '@/sources/usgs-quake'
import usgsFeed from '@/sources/usgs-quake/fixtures/4.5_week.json'
import { synthQuakes } from '@/sources/mock/earth'
import { fuseQuakes, scoreQuakes } from './earthquake'

const retrievedAt = '2026-10-04T17:30:00+09:00'
const jma = adaptList(listSchema.parse(jmaList), retrievedAt)
const usgs = adaptFeed(feedSchema.parse(usgsFeed), retrievedAt)

describe('jma-quake adapter', () => {
  it('parses JMA coordinates including shallow and depthless forms', () => {
    expect(parseCoordinate('+35.8+140.7-50000/')).toEqual({ lat: 35.8, lon: 140.7, depthKm: 50 })
    expect(parseCoordinate('+34.8+139.4+0/')).toEqual({ lat: 34.8, lon: 139.4, depthKm: 0 })
    expect(parseCoordinate('-21.2+168.5/')).toEqual({ lat: -21.2, lon: 168.5, depthKm: null })
    expect(parseCoordinate('')).toBeNull()
  })

  it('emits one observation per event id, skipping intensity-only bulletins', () => {
    const ids = jma.map((o) => o.nativeId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('20261002173952') // 震度速報 only
    const chiba = jma.find((o) => o.nativeId === '20261001212719')!
    expect(chiba.data).toMatchObject({ lat: 35.8, lon: 140.7, depthKm: 50, maxIntensity: '3' })
    expect(chiba.data.magnitude).toEqual({ value: 5.1, type: 'Mj' })
    // Issuance and origin are distinct times.
    expect(chiba.time.startedAt).toBe('2026-10-01T21:27:00+09:00')
    expect(chiba.time.issuedAt).not.toBe(chiba.time.startedAt)
  })

  it('reads per-station intensity from the detail bulletin', () => {
    const chiba = jma.find((o) => o.nativeId === '20261001212719')!
    const withDetail = adaptDetail(chiba, detailSchema.parse(jmaDetail))
    expect(withDetail.data.stations!.length).toBeGreaterThan(5)
    expect(withDetail.data.stations![0]).toMatchObject({
      lat: expect.any(Number),
      intensity: expect.any(String),
    })
    expect(withDetail.data.comments).toContain('この地震による津波の心配はありません。')
  })
})

describe('earthquake fusion (real fixtures)', () => {
  const { events, associations } = fuseQuakes(jma, usgs)
  const chiba = events.find((e) => e.sources.some((s) => s.nativeId === '20261001212719'))!

  it('associates the same quake across JMA and USGS with evidence', () => {
    const a = associations.find(
      (x) => x.a.nativeId === '20261001212719' && x.relation === 'same-event',
    )!
    expect(a.b.nativeId).toBe('us6000tytg')
    expect(a.confidence).toBeGreaterThanOrEqual(0.9)
    expect(a.method).toBe('earthquake-v1')
    expect(a.evidence.timeDeltaSec).toBeLessThan(75)
    expect(a.evidence.distanceKm).toBeLessThan(40)
  })

  it('takes the hypocentre from JMA inside Japan and keeps both magnitudes', () => {
    expect(chiba.sources).toHaveLength(2)
    expect(chiba.detail.hypocenter).toMatchObject({ lat: 35.8, lon: 140.7, depthKm: 50 })
    expect(chiba.fieldSources!.hypocenter!.sources).toEqual([
      { source: 'jma-quake', nativeId: '20261001212719' },
    ])
    const mags = chiba.measures.filter((m) => m.kind === 'earthquake.magnitude')
    expect(mags.map((m) => [m.variant, m.value, m.provenance.source])).toEqual(
      expect.arrayContaining([
        ['Mj', 5.1, 'jma-quake'],
        ['mww', 5.3, 'usgs-quake'],
      ]),
    )
    expect(chiba.detail.maxIntensity).toBe('3')
    expect(chiba.fieldSources!.intensity!.sources[0]!.source).toBe('jma-quake')
  })

  it('takes the hypocentre from USGS outside Japan', () => {
    const burma = events.find((e) => e.sources.some((s) => s.nativeId === 'us6000tzh0'))!
    expect(burma.fieldSources!.hypocenter!.method).toContain('/global')
    expect(burma.provenance.source).toBe('usgs-quake')
  })

  it('preserves provenance of every input', () => {
    const allRefs = new Set([...jma, ...usgs].map((o) => `${o.source}:${o.nativeId}`))
    const covered = new Set(
      events.flatMap((e) => e.sources.map((s) => `${s.source}:${s.nativeId}`)),
    )
    expect(covered).toEqual(allRefs)
    for (const e of events) {
      for (const m of e.measures) expect(m.provenance.retrievedAt).toBe(retrievedAt)
      for (const f of Object.values(e.fieldSources ?? {}))
        for (const s of f.sources) expect(e.sources).toContainEqual(s)
    }
  })

  it('labels AERIS severity as derived, never as the source statement', () => {
    const sev = quakeSeverity(chiba)
    expect(sev.value).toBe('minor')
    expect(sev.derivedFrom.method).toMatch(/^aeris:/)
    expect(chiba.detail.maxIntensity).toBe('3') // the native value is untouched
  })
})

// ── Property tests on synthetic catalogues ──────────────────────────────────

function obs(
  source: 'jma-quake' | 'usgs-quake',
  id: string,
  t: number,
  lat: number,
  lon: number,
  m: number,
  depth = 30,
): SourceObservation<QuakeSolution> {
  const originTime = toInstant(t)
  return {
    source,
    nativeId: id,
    sourceRole: 'observation',
    time: { startedAt: originTime },
    data: { originTime, lat, lon, depthKm: depth, magnitude: { value: m, type: 'M' } },
    provenance: { source, kind: 'observation', retrievedAt },
  }
}

/** Deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32
    return seed / 2 ** 32
  }
}

describe('association properties', () => {
  const T0 = Date.parse('2026-10-01T00:00:00Z')

  it('merges the same event despite typical agency differences', () => {
    const r = rng(1)
    for (let k = 0; k < 200; k++) {
      const t = T0 + k * 3_600_000
      const lat = 30 + r() * 15
      const lon = 125 + r() * 20
      const a = obs('jma-quake', `j${k}`, t - (t % 60_000), lat, lon, 5 + r())
      const b = obs(
        'usgs-quake',
        `u${k}`,
        t + r() * 20_000,
        lat + (r() - 0.5) * 0.4,
        lon + (r() - 0.5) * 0.4,
        a.data.magnitude!.value + (r() - 0.5) * 0.6,
        30 + (r() - 0.5) * 30,
      )
      const { events } = fuseQuakes([a], [b])
      expect(events).toHaveLength(1)
    }
  })

  it('never merges events far apart in time or space', () => {
    const r = rng(2)
    for (let k = 0; k < 200; k++) {
      const t = T0 + k * 3_600_000
      const a = obs('jma-quake', `j${k}`, t, 35, 140, 5)
      const farTime = obs('usgs-quake', `u${k}`, t + (6 + r() * 60) * 60_000, 35, 140, 5)
      const farSpace = obs('usgs-quake', `v${k}`, t, 35 + 3 + r() * 5, 140, 5)
      expect(fuseQuakes([a], [farTime, farSpace]).events).toHaveLength(3)
    }
  })

  it('does not merge an aftershock pair into one event', () => {
    // Mainshock + aftershock a minute later at the same place, reported by both agencies.
    const t = T0
    const j1 = obs('jma-quake', 'j1', t, 38, 142, 6.0)
    const j2 = obs('jma-quake', 'j2', t + 60_000, 38.05, 142.05, 5.6)
    const u1 = obs('usgs-quake', 'u1', t + 8_000, 38.1, 142.2, 6.1)
    const u2 = obs('usgs-quake', 'u2', t + 66_000, 38.0, 142.1, 5.5)
    const { events, associations } = fuseQuakes([j1, j2], [u1, u2])
    // Each canonical event has at most one record per source.
    for (const e of events) {
      const perSource = new Map<string, number>()
      for (const s of e.sources) perSource.set(s.source, (perSource.get(s.source) ?? 0) + 1)
      for (const n of perSource.values()) expect(n).toBe(1)
    }
    // Ambiguous pairs are flagged instead of silently merged.
    expect(associations.some((a) => a.evidence.ambiguous)).toBe(true)
    expect(events.length).toBeGreaterThanOrEqual(2)
  })

  it('scores symmetric', () => {
    const a = obs('jma-quake', 'a', T0, 35, 140, 5)
    const b = obs('usgs-quake', 'b', T0 + 30_000, 35.2, 140.1, 5.3)
    expect(scoreQuakes(a, b).confidence).toBe(scoreQuakes(b, a).confidence)
  })
})

describe('longitude handling', () => {
  it('normalises 0–360 and wraps around the antimeridian', () => {
    expect(normalizeLon(359)).toBe(-1)
    expect(normalizeLon(180)).toBe(-180)
    expect(normalizeLon(-179.9)).toBeCloseTo(-179.9)
    expect(normalizeLon(540)).toBe(-180)
  })

  it('splits a track crossing the dateline', () => {
    const parts = splitAtAntimeridian([
      [179.5, 10],
      [-179.5, 11],
    ])
    expect(parts).toHaveLength(2)
    expect(parts[0]!.at(-1)![0]).toBe(180)
    expect(parts[1]![0]![0]).toBe(-180)
    expect(parts[0]!.at(-1)![1]).toBeCloseTo(10.5)
  })

  it('keeps a track that does not cross in one piece', () => {
    expect(
      splitAtAntimeridian([
        [170, 10],
        [175, 12],
      ]),
    ).toHaveLength(1)
  })
})

describe('mock scenarios', () => {
  const now = '2026-10-04T16:24:00+09:00'

  it('quiet: only background seismicity, Hyuganada matched across agencies', () => {
    const { jma, usgs } = synthQuakes(now, 'quiet')
    const { events } = fuseQuakes(jma, usgs)
    const hyuga = events.find((e) => e.title === '日向灘')!
    expect(hyuga.sources).toHaveLength(2)
    expect(Math.max(...events.map((e) => intensityRank(e.detail.maxIntensity)))).toBeLessThan(3)
  })

  it('quake: a strong Kanto quake merges JMA and USGS and keeps both magnitudes', () => {
    const { jma, usgs } = synthQuakes(now, 'quake')
    const { events } = fuseQuakes(jma, usgs)
    const main = events.find((e) => e.detail.maxIntensity === '5+')!
    expect(main.sources.map((s) => s.source).sort()).toEqual(['jma-quake', 'usgs-quake'])
    expect(main.detail.stations.length).toBeGreaterThan(3)
    expect(quakeSeverity(main).value).toBe('severe')
  })
})
