/**
 * Wind arrows on the map sit on a global lattice whose spacing follows the
 * zoom, so the whole view is always covered at a readable density. Spacings
 * are powers of two in degrees: every coarser lattice is a subset of the
 * finer ones, so zooming in reuses the points already fetched.
 */
import type { GeoPoint } from './model'

/** Target distance between arrows on screen, px */
export const WIND_TARGET_PX = 96
/** Finest / coarsest lattice, degrees (finer than the model grid is pointless) */
export const WIND_MIN_SPACING = 0.125
export const WIND_MAX_SPACING = 16
/** Extra lattice rows/columns around the view, so small pans stay covered */
export const WIND_MARGIN = 2
/** Points are not drawn above this |latitude| (Web Mercator stretches them) */
const MAX_LAT = 80

export type ViewBounds = { west: number; south: number; east: number; north: number; zoom: number }

/** Lattice point: `lon` in the view's longitude space, `key` normalised. */
export type LatticePoint = GeoPoint & { key: string; fetchLon: number }

/** MapLibre tile size 512 px: degrees of longitude per pixel at a zoom. */
const degPerPx = (zoom: number) => 360 / (512 * Math.pow(2, zoom))

export function latticeSpacing(zoom: number, targetPx = WIND_TARGET_PX): number {
  const want = targetPx * degPerPx(zoom)
  const s = Math.pow(2, Math.round(Math.log2(want)))
  return Math.min(WIND_MAX_SPACING, Math.max(WIND_MIN_SPACING, s))
}

/** Longitude into [-180, 180). */
export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

const fix = (v: number) => Number(v.toFixed(4))
export const latticeKey = (lat: number, lon: number) => `${fix(lat)},${fix(normalizeLon(lon))}`

/** All lattice points covering the view plus a margin. */
export function latticePoints(
  view: ViewBounds,
  spacing = latticeSpacing(view.zoom),
): LatticePoint[] {
  const m = WIND_MARGIN * spacing
  const south = Math.max(-MAX_LAT, view.south - m)
  const north = Math.min(MAX_LAT, view.north + m)
  // A view wider than the world (low zoom, globe) needs each longitude once.
  const wide = view.east - view.west + 2 * m >= 360
  const west = wide ? -180 : view.west - m
  const east = wide ? 180 - spacing : view.east + m
  const pts: LatticePoint[] = []
  for (let i = Math.ceil(south / spacing); i * spacing <= north; i++) {
    const lat = fix(i * spacing)
    for (let j = Math.ceil(west / spacing); j * spacing <= east; j++) {
      const lon = fix(j * spacing)
      pts.push({ lat, lon, fetchLon: fix(normalizeLon(lon)), key: latticeKey(lat, lon) })
    }
  }
  return pts
}

/**
 * Lattice for a view with at most `max` points: when the zoom's spacing would
 * need more (very wide views), the spacing doubles until it fits, so the whole
 * view stays covered instead of being cut off.
 */
export function viewLattice(view: ViewBounds, max: number): LatticePoint[] {
  let s = latticeSpacing(view.zoom)
  let pts = latticePoints(view, s)
  while (pts.length > max && s < 90) {
    s *= 2
    pts = latticePoints(view, s)
  }
  return pts
}
