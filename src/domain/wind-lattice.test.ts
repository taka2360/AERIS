import { describe, expect, it } from 'vitest'
import {
  latticeKey,
  latticePoints,
  latticeSpacing,
  normalizeLon,
  viewLattice,
  WIND_MARGIN,
} from './wind-lattice'

describe('wind lattice', () => {
  it('keeps arrows roughly a fixed distance apart on screen', () => {
    expect(latticeSpacing(1.4)).toBe(16)
    expect(latticeSpacing(4)).toBe(4)
    expect(latticeSpacing(8.5)).toBe(0.25)
    // never finer than the model grid
    expect(latticeSpacing(12)).toBe(0.125)
  })

  it('covers the whole view plus a margin', () => {
    const view = { west: 130, south: 30, east: 145, north: 42, zoom: 5 }
    // The outermost row lies at least (margin − 1) spacings past each edge.
    const m = (WIND_MARGIN - 1) * latticeSpacing(view.zoom)
    const pts = latticePoints(view)
    const lats = pts.map((p) => p.lat)
    const lons = pts.map((p) => p.lon)
    expect(Math.min(...lats)).toBeLessThanOrEqual(view.south - m)
    expect(Math.max(...lats)).toBeGreaterThanOrEqual(view.north + m)
    expect(Math.min(...lons)).toBeLessThanOrEqual(view.west - m)
    expect(Math.max(...lons)).toBeGreaterThanOrEqual(view.east + m)
  })

  it('reuses coarse points when zooming in (coarser lattice ⊂ finer)', () => {
    const view = { west: 135, south: 33, east: 141, north: 37, zoom: 6 }
    // The margin scales with the spacing: compare inside the view only.
    const inView = (p: { lat: number; lon: number }) =>
      p.lat >= view.south && p.lat <= view.north && p.lon >= view.west && p.lon <= view.east
    const coarse = new Set(
      latticePoints(view, 1)
        .filter(inView)
        .map((p) => p.key),
    )
    const fine = new Set(latticePoints(view, 0.5).map((p) => p.key))
    for (const k of coarse) expect(fine.has(k)).toBe(true)
  })

  it('lists each longitude once for a view wider than the world', () => {
    const pts = latticePoints({ west: -400, south: -85, east: 400, north: 85, zoom: 0.5 })
    expect(new Set(pts.map((p) => p.key)).size).toBe(pts.length)
  })

  it('fetches past the antimeridian at the normalised longitude', () => {
    expect(normalizeLon(190)).toBe(-170)
    const p = latticePoints({ west: 178, south: 0, east: 182, north: 1, zoom: 7 }).find(
      (x) => x.lon === 181,
    )
    expect(p?.fetchLon).toBe(-179)
    expect(p?.key).toBe(latticeKey(p!.lat, -179))
  })

  it('coarsens a very wide view to fit the point budget instead of cutting it off', () => {
    const view = { west: -200, south: -85, east: 200, north: 85, zoom: 1 }
    const pts = viewLattice(view, 300)
    expect(pts.length).toBeLessThanOrEqual(300)
    const lats = pts.map((p) => p.lat)
    expect(Math.min(...lats)).toBeLessThan(-60)
    expect(Math.max(...lats)).toBeGreaterThan(60)
  })
})
