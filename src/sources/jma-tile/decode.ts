/**
 * Pixel → class decoding for JMA classification tiles, and Web-Mercator
 * tile math. Pure functions; image loading lives in index.ts.
 */
import type { DecodeStatus } from '@/domain/earth/common'
import type { PaletteClass, TilePalette } from './palettes'

export type PixelDecode =
  | { status: 'empty' } // fully transparent: no phenomenon drawn
  | { status: 'decoded'; cls: PaletteClass }
  | { status: 'not-decoded'; rgba: [number, number, number, number] }

const key = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b

const lookups = new WeakMap<TilePalette, Map<number, PaletteClass>>()

function lookupOf(p: TilePalette): Map<number, PaletteClass> {
  let m = lookups.get(p)
  if (!m) {
    m = new Map(p.classes.map((c) => [key(...c.rgb), c]))
    lookups.set(p, m)
  }
  return m
}

/** Exact palette lookup. Semi-transparent or unknown colours are NOT guessed. */
export function decodeClassificationPixel(
  rgba: ArrayLike<number>,
  palette: TilePalette,
): PixelDecode {
  const [r, g, b, a] = [rgba[0]!, rgba[1]!, rgba[2]!, rgba[3]!]
  if (a === 0) return { status: 'empty' }
  const hit = a === 255 ? lookupOf(palette).get(key(r, g, b)) : undefined
  return hit ? { status: 'decoded', cls: hit } : { status: 'not-decoded', rgba: [r, g, b, a] }
}

export type WindowDecode = {
  /** Highest class present, or null when nothing (decodable) is drawn */
  max: PaletteClass | null
  /** Class at the centre pixel */
  center: PixelDecode
  decode: DecodeStatus
  pixels: number
  unknown: number
}

/**
 * Decode a square window of an RGBA buffer (row-major, `width` px wide).
 * decode = 'not-decoded' if nothing could be read, 'partial' if some pixels
 * had unknown colours, 'decoded' otherwise.
 */
export function decodeWindow(
  data: ArrayLike<number>,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  palette: TilePalette,
): WindowDecode {
  let max: PaletteClass | null = null
  let unknown = 0
  let known = 0
  let pixels = 0
  let center: PixelDecode = { status: 'empty' }
  for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y++)
    for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x++) {
      const i = (y * width + x) * 4
      const d = decodeClassificationPixel(
        [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!],
        palette,
      )
      pixels++
      if (x === cx && y === cy) center = d
      if (d.status === 'decoded') {
        known++
        if (!max || d.cls.cls > max.cls) max = d.cls
      } else if (d.status === 'not-decoded') unknown++
    }
  const decode: DecodeStatus = unknown === 0 ? 'decoded' : known === 0 ? 'not-decoded' : 'partial'
  return { max, center, decode, pixels, unknown }
}

/** Web-Mercator: which tile, and which pixel within it, contains (lat, lon). */
export function tilePixel(lat: number, lon: number, z: number, tileSize = 256) {
  const n = 2 ** z
  const xf = ((lon + 180) / 360) * n
  const latR = (lat * Math.PI) / 180
  const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n
  const x = Math.floor(xf)
  const y = Math.floor(yf)
  return {
    x,
    y,
    px: Math.min(tileSize - 1, Math.floor((xf - x) * tileSize)),
    py: Math.min(tileSize - 1, Math.floor((yf - y) * tileSize)),
  }
}

/**
 * JMA publishes images at EVEN zoom levels only (odd levels are blank).
 * An odd-zoom tile is the matching quadrant of its even parent.
 */
export function evenZoomSource(z: number, x: number, y: number) {
  if (z % 2 === 0) return { z, x, y, quadrant: null }
  return { z: z - 1, x: x >> 1, y: y >> 1, quadrant: { qx: x & 1, qy: y & 1 } }
}
