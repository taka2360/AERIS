/**
 * Browser-side tile loading for point sampling. Decodes a JMA tile into RGBA
 * and reads a window around a location. Even-zoom only (see evenZoomSource).
 */
import type { FieldSample, RasterFrame } from '@/domain/earth/fields'
import type { Provenance } from '@/domain/model'
import { decodeWindow, tilePixel, type WindowDecode } from './decode'
import type { PaletteClass, TilePalette } from './palettes'

export async function loadTilePixels(
  url: string,
  signal?: AbortSignal,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`tile HTTP ${res.status}`)
  const bitmap = await createImageBitmap(await res.blob())
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { data: img.data, width: img.width, height: img.height }
}

/**
 * Sample a classification field at a point. `radiusPx` widens the window
 * (e.g. "lightning within ~5 km"); the highest class in the window is the value.
 */
export async function sampleFrame(
  frame: RasterFrame,
  palette: TilePalette,
  lat: number,
  lon: number,
  provenance: Provenance,
  opts: { zoom?: number; radiusPx?: number; signal?: AbortSignal } = {},
): Promise<FieldSample<PaletteClass> & { window: WindowDecode }> {
  const zoom = opts.zoom ?? 8
  const z = zoom % 2 === 0 ? zoom : zoom - 1
  const t = tilePixel(lat, lon, z)
  const url = frame.tileUrlTemplate
    .replace('{z}', String(z))
    .replace('{x}', String(t.x))
    .replace('{y}', String(t.y))
  const px = await loadTilePixels(url, opts.signal)
  const window = decodeWindow(px.data, px.width, px.height, t.px, t.py, opts.radiusPx ?? 0, palette)
  return {
    value: window.max,
    validFrom: frame.validFrom,
    validUntil: frame.validUntil,
    role: frame.role,
    decode: window.decode,
    provenance: { ...provenance, decode: window.decode },
    window,
  }
}
