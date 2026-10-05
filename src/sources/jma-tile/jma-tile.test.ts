/**
 * Golden tests for JMA tile decoding: exact palette matches only, unknown
 * colours are NOT DECODED (never approximated), mixed windows are PARTIAL.
 */
import { describe, expect, it } from 'vitest'
import { TILE_PALETTES } from '@/ui/map/style'
import { evenZoomSource as protocolEvenZoom } from '@/ui/map/jma-protocol'
import { decodeClassificationPixel, decodeWindow, evenZoomSource, tilePixel } from './decode'
import n3 from './fixtures/targetTimes_N3.json'
import riskTimes from './fixtures/risk_targetTimes.json'
import snowTimes from './fixtures/snow_targetTimes.json'
import { adaptLiden, buildSeries, FIELD_SPECS, lidenFrames, targetTimesSchema } from './index'
import { PALETTES } from './palettes'

const retrievedAt = '2026-10-04T18:30:00+09:00'

describe('palette decoding', () => {
  it('decodes every legend colour of every field to its class', () => {
    for (const palette of Object.values(PALETTES))
      for (const cls of palette.classes) {
        const d = decodeClassificationPixel([...cls.rgb, 255], palette)
        expect(d, `${palette.kind} ${cls.label}`).toEqual({ status: 'decoded', cls })
      }
  })

  it('treats transparency as "nothing drawn"', () => {
    expect(decodeClassificationPixel([0, 0, 0, 0], PALETTES['lightning-activity'])).toEqual({
      status: 'empty',
    })
  })

  it('never approximates an unknown or blended colour', () => {
    const p = PALETTES['lightning-activity']
    // One unit off the 活動度3 red, and the same red half-transparent.
    expect(decodeClassificationPixel([255, 41, 0, 255], p).status).toBe('not-decoded')
    expect(decodeClassificationPixel([255, 40, 0, 128], p).status).toBe('not-decoded')
  })

  it('reports the highest class in a window and flags unknown pixels', () => {
    const p = PALETTES['kikikuru-land']
    const px = (rgb: number[], a = 255) => [...rgb, a]
    // 3×3 window: 注意, 警戒, empty… plus one unknown colour.
    const data = [
      px([242, 231, 0]),
      px([255, 40, 0]),
      px([0, 0, 0], 0),
      px([0, 0, 0], 0),
      px([242, 231, 0]),
      px([0, 0, 0], 0),
      px([1, 2, 3]),
      px([0, 0, 0], 0),
      px([0, 0, 0], 0),
    ].flat()
    const w = decodeWindow(data, 3, 3, 1, 1, 1, p)
    expect(w.max?.label).toBe('警戒')
    expect(w.max?.value).toBe(3)
    expect(w.center).toMatchObject({ status: 'decoded' })
    expect(w.decode).toBe('partial')
    expect(w.unknown).toBe(1)

    const allUnknown = decodeWindow([1, 2, 3, 255], 1, 1, 0, 0, 0, p)
    expect(allUnknown.decode).toBe('not-decoded')
    expect(allUnknown.max).toBeNull()
  })

  it('keeps the map recolouring palettes in step with the decoder palettes', () => {
    const pairs = [
      ['precip', 'precip-intensity'],
      ['thunder', 'lightning-activity'],
      ['tornado', 'tornado-probability'],
      ['kikikuru', 'kikikuru-land'],
      ['snow', 'snow-depth'],
      ['snowfall', 'snowfall-3h'],
    ] as const
    for (const [ui, src] of pairs)
      expect(TILE_PALETTES[ui].map((c) => c.jma)).toEqual(PALETTES[src].classes.map((c) => c.rgb))
  })
})

describe('tile math', () => {
  it('locates Tokyo in the z8 grid', () => {
    const t = tilePixel(35.68, 139.77, 8)
    expect([t.x, t.y]).toEqual([227, 100])
    expect(t.px).toBeGreaterThanOrEqual(0)
    expect(t.px).toBeLessThan(256)
  })

  it('serves odd zooms from the even parent quadrant (same rule in decoder and map)', () => {
    for (const f of [evenZoomSource, protocolEvenZoom]) {
      expect(f(6, 56, 25)).toEqual({ z: 6, x: 56, y: 25, quadrant: null })
      expect(f(7, 113, 51)).toEqual({ z: 6, x: 56, y: 25, quadrant: { qx: 1, qy: 1 } })
    }
  })
})

describe('time lists → series', () => {
  const nowc = targetTimesSchema.parse(n3)

  it('builds lightning frames with analysis vs nowcast roles and intervals', () => {
    const s = buildSeries(FIELD_SPECS['lightning-activity'], nowc, retrievedAt)
    expect(s.frames.length).toBeGreaterThan(5)
    expect(s.frames.some((f) => f.role === 'analysis')).toBe(true)
    expect(s.frames.some((f) => f.role === 'nowcast')).toBe(true)
    for (let i = 1; i < s.frames.length; i++)
      expect(s.frames[i]!.validFrom >= s.frames[i - 1]!.validFrom).toBe(true)
    expect(s.frames[0]!.tileUrlTemplate).toMatch(/\/surf\/thns\/\{z\}\/\{x\}\/\{y\}\.png$/)
    expect(s.provenance.source).toBe('jma-thunder')
  })

  it('keeps the newest キキクル analysis per time', () => {
    const s = buildSeries(
      FIELD_SPECS['kikikuru-land'],
      targetTimesSchema.parse(riskTimes),
      retrievedAt,
    )
    expect(s.frames.every((f) => f.role === 'analysis')).toBe(true)
    expect(s.frames.at(-1)!.tileUrlTemplate).toContain('/immed0/')
    expect(s.provenance.sourceRole).toBe('assessment')
  })

  it('marks snow analysis as estimated and future frames as forecast', () => {
    const s = buildSeries(
      FIELD_SPECS['snow-depth'],
      targetTimesSchema.parse(snowTimes),
      retrievedAt,
    )
    expect(s.derivation).toBe('estimated')
    expect(s.frames.some((f) => f.role === 'forecast')).toBe(true)
  })
})

describe('LIDEN strokes', () => {
  it('picks observed LIDEN frames newest first', () => {
    const frames = lidenFrames(targetTimesSchema.parse(n3))
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every((f) => f.basetime === f.validtime)).toBe(true)
  })

  it('maps type 4 to cloud-to-ground and keeps the 5-minute window', () => {
    const strokes = adaptLiden(
      {
        type: 'FeatureCollection',
        features: [
          { geometry: { type: 'Point', coordinates: [139.7, 35.6] }, properties: { type: 4 } },
          { geometry: { type: 'Point', coordinates: [139.8, 35.7] }, properties: { type: 1 } },
        ],
      },
      '2026-10-04T18:30:00+09:00',
    )
    expect(strokes.map((s) => s.kind)).toEqual(['cg', 'cc'])
    expect(strokes[0]!.windowStart).toBe('2026-10-04T18:25:00+09:00')
  })
})
