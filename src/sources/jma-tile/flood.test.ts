import { PbfWriter as Pbf } from 'pbf'
import { describe, expect, it } from 'vitest'
import { FLOOD_ZOOM, floodLevelNear, floodTilesFor, type FloodTile } from './flood'

/*
 * JMA only serves segments at 注意 or above, and live tiles were empty when
 * this was written, so the tile here is encoded by hand in the same Mapbox
 * Vector Tile layout (layer 'flood', integer property 'level', line geometry).
 */
const EXTENT = 4096
const zigzag = (n: number) => (n << 1) ^ (n >> 31)

function encodeTile(lines: Array<{ level: number; points: Array<[number, number]> }>) {
  const levels = [...new Set(lines.map((l) => l.level))]
  const pbf = new Pbf()
  pbf.writeMessage(
    3,
    (_: unknown, p: Pbf) => {
      p.writeVarintField(15, 2)
      p.writeStringField(1, 'flood')
      for (const l of lines)
        p.writeMessage(
          2,
          (_: unknown, f: Pbf) => {
            f.writePackedVarint(2, [0, levels.indexOf(l.level)])
            f.writeVarintField(3, 2) // LINESTRING
            const geom = [(l.points.length > 0 ? 1 : 0) | (1 << 3)]
            let [cx, cy] = [0, 0]
            l.points.forEach(([x, y], i) => {
              if (i === 1) geom.push(2 | ((l.points.length - 1) << 3))
              geom.push(zigzag(x - cx), zigzag(y - cy))
              ;[cx, cy] = [x, y]
            })
            f.writePackedVarint(4, geom)
          },
          null,
        )
      p.writeStringField(3, 'level')
      for (const v of levels)
        p.writeMessage(4, (_: unknown, m: Pbf) => m.writeVarintField(5, v), null)
      p.writeVarintField(5, EXTENT)
    },
    null,
  )
  return pbf.finish()
}

// Tokyo station and the z10 tile it is in.
const lat = 35.68
const lon = 139.77
const [home] = floodTilesFor(lat, lon, 0)
const n = 2 ** FLOOD_ZOOM
const px = ((lon + 180) / 360) * n
const r = (lat * Math.PI) / 180
const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
const kmPerUnit = (40_075.016686 * Math.cos(r)) / n / EXTENT
/** The point in tile units, moved east by `eastKm`. */
const at = (eastKm: number): [number, number] => [
  Math.round((px - home!.x) * EXTENT + eastKm / kmPerUnit),
  Math.round((py - home!.y) * EXTENT),
]
const vertical = (eastKm: number): Array<[number, number]> => {
  const [x, y] = at(eastKm)
  return [
    [x, y - 200],
    [x, y + 200],
  ]
}

describe('洪水キキクル point sample', () => {
  it('lists the tiles a radius touches', () => {
    expect(floodTilesFor(lat, lon, 0)).toHaveLength(1)
    expect(floodTilesFor(lat, lon, 40).length).toBeGreaterThan(1)
  })

  it('reads an empty tile (as JMA serves it with no river at risk) as level 0', () => {
    const tile: FloodTile = { ...home!, data: new Uint8Array() }
    expect(floodLevelNear([tile], lat, lon, 2)).toEqual({ level: 0, unknown: 0 })
  })

  it('takes the highest level among river segments within the radius', () => {
    const data = encodeTile([
      { level: 1, points: vertical(0.5) },
      { level: 3, points: vertical(1.5) },
      { level: 4, points: vertical(5) },
    ])
    const tile = { ...home!, data }
    expect(floodLevelNear([tile], lat, lon, 2).level).toBe(3)
    expect(floodLevelNear([tile], lat, lon, 1).level).toBe(1)
    expect(floodLevelNear([tile], lat, lon, 0.2).level).toBe(0)
  })

  it('counts unknown levels instead of guessing', () => {
    const data = encodeTile([{ level: 9, points: vertical(0.3) }])
    expect(floodLevelNear([{ ...home!, data }], lat, lon, 2)).toEqual({ level: 0, unknown: 1 })
  })
})
