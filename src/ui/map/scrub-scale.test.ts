import { describe, expect, it } from 'vitest'
import {
  keyStep,
  offsetToPosition,
  positionPct,
  positionToOffset,
  scaleMarks,
  scrubScale,
} from './scrub-scale'

describe('scrub scale', () => {
  const sc = scrubScale(24 * 60, 60)

  it('puts now at the centre and both ends at the span limits', () => {
    expect(positionToOffset(sc, 0)).toBe(0)
    expect(positionPct(sc, 0)).toBe(50)
    expect(positionToOffset(sc, 1)).toBe(60)
    expect(positionToOffset(sc, -1)).toBe(-1440)
  })

  it('rewinds faster further into the past', () => {
    const near = -positionToOffset(sc, -0.25)
    const far = -positionToOffset(sc, -1) - -positionToOffset(sc, -0.75)
    expect(near).toBeLessThan(60)
    expect(far).toBeGreaterThan(near * 10)
  })

  it('round-trips offsets and positions', () => {
    for (const m of [-1440, -300, -45, -5, 0, 20, 60])
      expect(positionToOffset(sc, offsetToPosition(sc, m))).toBeCloseTo(m, 6)
  })

  it('is linear when the past is no longer than the future', () => {
    const lin = scrubScale(60, 60)
    expect(lin.k).toBe(1)
    expect(positionToOffset(lin, -0.5)).toBe(-30)
  })

  it('uses the whole track for the past when there is no future', () => {
    const past = scrubScale(1440, 0)
    expect(past.max).toBe(0)
    expect(positionPct(past, 0)).toBe(100)
    expect(offsetToPosition(past, 30)).toBe(0)
  })

  it('steps the keyboard in time: 5 min near now, larger far back', () => {
    expect(keyStep(0, 5)).toBe(5)
    expect(keyStep(-20, 5)).toBe(5)
    expect(keyStep(-1440, 5)).toBe(145)
  })

  it('names NOW and only marks inside the span', () => {
    const labels = scaleMarks(scrubScale(180, 60)).map((m) => m.label)
    expect(labels).toEqual(['−3H', '−1H', 'NOW', '+30M', '+1H'])
  })
})
