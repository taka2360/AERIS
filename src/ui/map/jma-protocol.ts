/**
 * aeris-jma://<palette>/<host>/<path>/{z}/{x}/{y}.png
 *
 * MapLibre fetches JMA classification tiles through this protocol, which
 *  1. serves odd zoom levels from the even parent tile (JMA publishes even
 *     zooms only; odd-zoom images are blank), cropping the right quadrant;
 *  2. repaints every pixel from JMA's palette into the AERIS palette by
 *     exact colour match — unknown colours become transparent.
 * Runs on the main thread; ~65k px per tile.
 */
import { addProtocol } from 'maplibre-gl'
import { recolorPixels, TILE_PALETTES, type TilePaletteId } from './style'

export const JMA_PROTOCOL = 'aeris-jma'

/** Even-zoom source of a requested tile (odd zoom → parent + quadrant). */
export function evenZoomSource(z: number, x: number, y: number) {
  if (z % 2 === 0) return { z, x, y, quadrant: null }
  return { z: z - 1, x: x >> 1, y: y >> 1, quadrant: { qx: x & 1, qy: y & 1 } }
}

/** https URL template → protocol URL template for a palette. */
export function jmaTiles(url: string | null, palette: TilePaletteId): string[] {
  return url ? [url.replace(/^https:\/\//, `${JMA_PROTOCOL}://${palette}/`)] : []
}

const TILE_RE = /^(.*)\/(\d+)\/(\d+)\/(\d+)\.png$/

let registered = false

export function registerJmaProtocol() {
  if (registered) return
  registered = true
  addProtocol(JMA_PROTOCOL, async (params, abort) => {
    const rest = params.url.slice(`${JMA_PROTOCOL}://`.length)
    const slash = rest.indexOf('/')
    const palette = TILE_PALETTES[rest.slice(0, slash) as TilePaletteId]
    const m = TILE_RE.exec(`https://${rest.slice(slash + 1)}`)
    if (!palette || !m) throw new Error('bad aeris-jma url')
    const src = evenZoomSource(Number(m[2]), Number(m[3]), Number(m[4]))
    const res = await fetch(`${m[1]}/${src.z}/${src.x}/${src.y}.png`, { signal: abort.signal })
    if (!res.ok) throw new Error(`jma tile HTTP ${res.status}`)
    const bitmap = await createImageBitmap(await res.blob())
    const size = bitmap.width
    const canvas = new OffscreenCanvas(size, size)
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false // classification data: never blend colours
    if (src.quadrant) {
      const h = size / 2
      ctx.drawImage(bitmap, src.quadrant.qx * h, src.quadrant.qy * h, h, h, 0, 0, size, size)
    } else ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const img = ctx.getImageData(0, 0, size, size)
    recolorPixels(img.data, palette)
    ctx.putImageData(img, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return { data: await blob.arrayBuffer() }
  })
}
