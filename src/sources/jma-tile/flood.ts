/**
 * 洪水キキクル at a point. The product is a vector tile of river segments
 * (source-layer 'flood', property 'level': 1 注意 … 4 災害切迫; segments at
 * 今後の情報等に留意 are not in the tile). The value is the highest level of
 * any segment within `radiusKm`, mapped onto the same 警戒レベル相当 classes
 * as the raster キキクル. An empty tile means no river is at risk.
 */
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import type { FieldSample, RasterFrame } from '@/domain/earth/fields'
import type { Provenance } from '@/domain/model'
import { PALETTES, type PaletteClass } from './palettes'

/** Native zoom read for sampling: the finest JMA publishes (~0.04 km per unit). */
export const FLOOD_ZOOM = 10
const EARTH_CIRCUMFERENCE_M = 40_075_016.686

export type FloodTile = { x: number; y: number; data: Uint8Array }

/** Global position at `z` in tile units (tile index + fraction). */
function tilePosition(lat: number, lon: number, z: number) {
  const n = 2 ** z
  const r = (lat * Math.PI) / 180
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n,
  }
}

/** Tiles (at FLOOD_ZOOM) that a circle of `radiusKm` around the point touches. */
export function floodTilesFor(lat: number, lon: number, radiusKm: number) {
  const p = tilePosition(lat, lon, FLOOD_ZOOM)
  const tileKm = (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / 2 ** FLOOD_ZOOM / 1000
  const d = radiusKm / tileKm
  const tiles: Array<{ x: number; y: number }> = []
  for (let x = Math.floor(p.x - d); x <= Math.floor(p.x + d); x++)
    for (let y = Math.floor(p.y - d); y <= Math.floor(p.y + d); y++) tiles.push({ x, y })
  return tiles
}

function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Highest 洪水キキクル level (0 = none at risk) of segments within `radiusKm`.
 * `unknown` counts nearby segments whose level is not one of 1–4.
 */
export function floodLevelNear(
  tiles: FloodTile[],
  lat: number,
  lon: number,
  radiusKm: number,
): { level: number; unknown: number } {
  const p = tilePosition(lat, lon, FLOOD_ZOOM)
  const tileKm = (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / 2 ** FLOOD_ZOOM / 1000
  let level = 0
  let unknown = 0
  for (const t of tiles) {
    if (t.data.byteLength === 0) continue
    const layer = new VectorTile(new PbfReader(t.data)).layers.flood
    if (!layer) continue
    const kmPerUnit = tileKm / layer.extent
    // The point in this tile's coordinate space.
    const ux = (p.x - t.x) * layer.extent
    const uy = (p.y - t.y) * layer.extent
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i)
      let near = Infinity
      for (const ring of f.loadGeometry()) {
        if (ring.length === 1) near = Math.min(near, Math.hypot(ux - ring[0]!.x, uy - ring[0]!.y))
        for (let j = 1; j < ring.length; j++) {
          const a = ring[j - 1]!
          const b = ring[j]!
          near = Math.min(near, segmentDistance(ux, uy, a.x, a.y, b.x, b.y))
        }
      }
      if (near * kmPerUnit > radiusKm) continue
      const l = f.properties.level
      if (l === 1 || l === 2 || l === 3 || l === 4) level = Math.max(level, l)
      else unknown++
    }
  }
  return { level, unknown }
}

async function loadTile(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`tile HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function sampleFlood(
  frame: RasterFrame,
  lat: number,
  lon: number,
  radiusKm: number,
  provenance: Provenance,
  signal?: AbortSignal,
): Promise<FieldSample<PaletteClass>> {
  const tiles = await Promise.all(
    floodTilesFor(lat, lon, radiusKm).map(async ({ x, y }) => ({
      x,
      y,
      data: await loadTile(
        frame.tileUrlTemplate
          .replace('{z}', String(FLOOD_ZOOM))
          .replace('{x}', String(x))
          .replace('{y}', String(y)),
        signal,
      ),
    })),
  )
  const { level, unknown } = floodLevelNear(tiles, lat, lon, radiusKm)
  const decode = unknown === 0 ? 'decoded' : level > 0 ? 'partial' : 'not-decoded'
  // Vector level L is raster class L (0 留意, 1 注意 … 4 災害切迫).
  const cls = decode === 'not-decoded' ? null : PALETTES['kikikuru-flood'].classes[level]
  return {
    value: cls ?? null,
    validFrom: frame.validFrom,
    validUntil: frame.validUntil,
    role: frame.role,
    decode,
    provenance: { ...provenance, decode },
  }
}
