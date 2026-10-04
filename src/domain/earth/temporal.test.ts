import { describe, expect, it } from 'vitest'
import type { ForecastIssue, TrackPoint } from './events'
import {
  activeWindow,
  cyclonePositionAt,
  frameAt,
  framesToIntervals,
  latestObserved,
  validAt,
} from './temporal'

const at = (hm: string) => `2026-10-04T${hm}:00+09:00`

const frames = framesToIntervals([
  { validTime: at('16:00'), role: 'observed' as const },
  { validTime: at('16:05'), role: 'observed' as const },
  { validTime: at('16:10'), role: 'observed' as const },
  { validTime: at('16:15'), role: 'nowcast' as const },
  { validTime: at('16:20'), role: 'nowcast' as const },
])

describe('raster frames', () => {
  it('gives each frame half a step either side', () => {
    expect(frames[1]).toMatchObject({
      validFrom: '2026-10-04T16:02:30+09:00',
      validUntil: '2026-10-04T16:07:30+09:00',
    })
    expect(frames[0]!.validFrom).toBe('2026-10-04T15:57:30+09:00')
  })

  it('resolves the frame valid at t', () => {
    expect(frameAt(frames, at('16:06'))?.validTime).toBe(at('16:05'))
    expect(frameAt(frames, at('16:19'))?.validTime).toBe(at('16:20'))
  })

  it('returns NO DATA beyond the last frame instead of stretching it', () => {
    expect(frameAt(frames, at('16:30'))).toBeNull()
    expect(frameAt(frames, at('15:00'))).toBeNull()
  })

  it('live view uses the newest observation, never a forecast frame', () => {
    expect(latestObserved(frames, at('16:17'))?.validTime).toBe(at('16:10'))
    expect(latestObserved(frames, at('16:07'))?.validTime).toBe(at('16:05'))
  })
})

describe('intervals and windows', () => {
  const items = [
    { id: 'a', time: { validFrom: at('15:00'), validUntil: at('17:00') } },
    { id: 'b', time: { issuedAt: at('16:00') } }, // open-ended
    { id: 'c', time: { validFrom: at('18:00') } }, // not yet valid
  ]

  it('selects records whose validity contains t', () => {
    expect(validAt(items, at('16:30')).map((x) => x.id)).toEqual(['a', 'b'])
    expect(validAt(items, at('17:30')).map((x) => x.id)).toEqual(['b'])
    expect(validAt(items, at('14:00'))).toEqual([])
  })

  it('shows point events only after they happen, fading over the window', () => {
    const events = [{ t: at('16:00') }, { t: at('17:00') }]
    const r = activeWindow(events, (e) => e.t, at('16:30'), 60)
    expect(r).toHaveLength(1)
    expect(r[0]!.age).toBeCloseTo(0.5)
  })
})

describe('cyclone track', () => {
  const p = (hm: string, lat: number, lon: number, role: TrackPoint['role']): TrackPoint => ({
    validAt: at(hm),
    lat,
    lon,
    role,
  })
  const observed = [p('09:00', 20, 130, 'observed'), p('15:00', 21, 131, 'observed')]
  const issueA: ForecastIssue = {
    issuedAt: at('15:45'),
    points: [p('15:00', 21, 131, 'analysis'), p('21:00', 22, 132, 'forecast')],
  }
  const issueOld: ForecastIssue = {
    issuedAt: at('09:45'),
    points: [p('09:00', 20, 130, 'analysis'), p('23:00', 30, 140, 'forecast')],
  }

  it('interpolates the observed track in the past', () => {
    const pos = cyclonePositionAt(observed, [issueA], at('12:00'))!
    expect(pos).toMatchObject({ lat: 20.5, lon: 130.5, role: 'observed' })
  })

  it('interpolates only within the newest issue for the future', () => {
    const pos = cyclonePositionAt(observed, [issueOld, issueA], at('18:00'))!
    expect(pos.role).toBe('forecast')
    expect(pos.lat).toBeCloseTo(21.5)
    expect(pos.lon).toBeCloseTo(131.5)
  })

  it('returns NO DATA past the last forecast point', () => {
    expect(cyclonePositionAt(observed, [issueOld, issueA], at('22:00'))).toBeNull()
  })

  it('takes the short way across the antimeridian', () => {
    const track = [p('00:00', 10, 179, 'observed'), p('02:00', 10, -179, 'observed')]
    const pos = cyclonePositionAt(track, [], at('01:00'))!
    expect(Math.abs(pos.lon)).toBeCloseTo(180)
  })
})
