import { describe, expect, it } from 'vitest'
import { haversineKm } from '@/domain/derive'
import { circleBounds, destination, ringsGeoJSON } from './geo'
import { RADAR_PALETTE, recolorRadarPixels } from './style'

describe('map geometry', () => {
  it('places a destination point at the requested distance', () => {
    const p = destination(35.68, 139.77, 90, 20)
    expect(haversineKm(35.68, 139.77, p.lat, p.lon)).toBeCloseTo(20, 1)
    expect(p.lat).toBeCloseTo(35.68, 1)
  })

  it('builds closed ring lines plus label points', () => {
    const fc = ringsGeoJSON(35.68, 139.77, [10, 20], 48)
    const lines = fc.features.filter((f) => f.geometry.type === 'LineString')
    expect(lines).toHaveLength(2)
    const coords = lines[0]!.geometry.coordinates as number[][]
    expect(coords[0]).toEqual(coords.at(-1))
    expect(fc.features.filter((f) => f.geometry.type === 'Point').map((f) => f.properties)).toEqual(
      [{ label: '10KM' }, { label: '20KM' }],
    )
  })

  it('bounds a circle symmetrically', () => {
    const [[w, s], [e, n]] = circleBounds(35.68, 139.77, 45)
    expect((w + e) / 2).toBeCloseTo(139.77, 3)
    expect(n - 35.68).toBeCloseTo(35.68 - s, 3)
  })
})

describe('radar recolouring', () => {
  it('maps every JMA band to its AERIS colour and drops unknown colours', () => {
    const px = new Uint8ClampedArray(
      [...RADAR_PALETTE.map((p) => [...p.jma, 255]), [1, 2, 3, 255], [0, 0, 0, 0]].flat(),
    )
    recolorRadarPixels(px)
    RADAR_PALETTE.forEach((p, i) => {
      expect([...px.slice(i * 4, i * 4 + 4)]).toEqual(p.rgba)
    })
    const n = RADAR_PALETTE.length
    expect(px[n * 4 + 3]).toBe(0) // unknown colour → transparent
    expect(px[(n + 1) * 4 + 3]).toBe(0) // transparent stays transparent
  })

  it('keeps intensity order: heavier bands are more opaque', () => {
    const alphas = RADAR_PALETTE.map((p) => p.rgba[3])
    expect([...alphas].sort((a, b) => a - b)).toEqual(alphas)
  })
})
