import { describe, expect, it } from 'vitest'
import { latticeKey } from '@/domain/wind-lattice'
import { loadWindCache, serializeWindCache } from './viewport-wind'

const HOUR = 60 * 60_000
const entry = (lat: number, lon: number, at: number) => ({
  sample: { lat, lon, speed: 5, direction: 270 },
  at,
})

describe('stored wind cache', () => {
  it('round-trips unexpired points under their lattice keys', () => {
    const now = 10 * HOUR
    const cache = new Map([
      [latticeKey(35, 139), entry(35, 139, now - 10_000)],
      [latticeKey(36, -179.5), entry(36, -179.5, now - 20_000)],
    ])
    const restored = loadWindCache(serializeWindCache(cache, now), now)
    expect(restored).toEqual(cache)
  })

  it('drops points older than an hour, on save and on load', () => {
    const now = 10 * HOUR
    const json = serializeWindCache(
      new Map([
        [latticeKey(35, 139), entry(35, 139, now - HOUR - 1)],
        [latticeKey(36, 140), entry(36, 140, now - 1_000)],
      ]),
      now,
    )
    expect(JSON.parse(json)).toHaveLength(1)
    expect(loadWindCache(json, now + HOUR).size).toBe(0)
  })

  it('ignores missing or malformed data', () => {
    expect(loadWindCache(null, 0).size).toBe(0)
    expect(loadWindCache('{oops', 0).size).toBe(0)
    expect(loadWindCache('{"a":1}', 0).size).toBe(0)
    expect(loadWindCache('[[35,139,"5",270,0],[1,2]]', 0).size).toBe(0)
  })
})
