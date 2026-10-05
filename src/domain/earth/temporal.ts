/**
 * Temporal resolution: given records and a time t, which record (if any)
 * describes the world at t? Each data shape has its own rule. None of them
 * stretches the newest observation into the future: if nothing is valid at t
 * the answer is "no data".
 */
import { addMinutes, epoch, minutesBetween, type Instant } from '../time'
import type { TemporalRole } from './common'
import type { ForecastIssue, TrackPoint } from './events'

export type Interval = { validFrom: Instant; validUntil: Instant }

/** A frame of a raster time series. */
export type TimedFrame = Interval & { role: TemporalRole }

/**
 * Turn instantaneous frame times into validity intervals: each frame is valid
 * from halfway after the previous frame to halfway before the next one; the
 * ends extend by half the local step (never further).
 */
export function framesToIntervals<T extends { validTime: Instant }>(
  frames: T[],
): Array<T & Interval> {
  const sorted = [...frames].sort((a, b) => epoch(a.validTime) - epoch(b.validTime))
  return sorted.map((f, i) => {
    const prev = sorted[i - 1]
    const next = sorted[i + 1]
    const stepBefore = prev
      ? minutesBetween(prev.validTime, f.validTime)
      : next
        ? minutesBetween(f.validTime, next.validTime)
        : 5
    const stepAfter = next ? minutesBetween(f.validTime, next.validTime) : stepBefore
    return {
      ...f,
      validFrom: addMinutes(f.validTime, -stepBefore / 2),
      validUntil: addMinutes(f.validTime, stepAfter / 2),
    }
  })
}

/** Frame whose interval contains t, or null. */
export function frameAt<T extends Interval>(frames: T[], t: Instant): T | null {
  const ms = epoch(t)
  return frames.find((f) => epoch(f.validFrom) <= ms && ms < epoch(f.validUntil)) ?? null
}

/**
 * The "current state" for live display: the newest OBSERVED frame at or
 * before now — never a forecast frame, even if one is valid now.
 */
export function latestObserved<T extends { validTime: Instant; role: TemporalRole }>(
  frames: T[],
  now: Instant,
): T | null {
  const ms = epoch(now)
  let best: T | null = null
  for (const f of frames)
    if (f.role === 'observed' && epoch(f.validTime) <= ms)
      if (!best || epoch(f.validTime) > epoch(best.validTime)) best = f
  return best
}

/** Records (warnings, assessments) whose validity interval contains t. */
export function validAt<
  T extends { time: { validFrom?: Instant; validUntil?: Instant; issuedAt?: Instant } },
>(items: T[], t: Instant): T[] {
  const ms = epoch(t)
  return items.filter((x) => {
    const from = x.time.validFrom ?? x.time.issuedAt
    if (!from || epoch(from) > ms) return false
    return !x.time.validUntil || ms < epoch(x.time.validUntil)
  })
}

/**
 * Point events visible at t: started at or before t and no older than the
 * decay window. `age` runs 0 (just happened) → 1 (about to fade out).
 */
export function activeWindow<T>(
  items: T[],
  startOf: (x: T) => Instant | undefined,
  t: Instant,
  windowMin: number,
): Array<{ item: T; age: number }> {
  const out: Array<{ item: T; age: number }> = []
  for (const item of items) {
    const s = startOf(item)
    if (!s) continue
    const m = minutesBetween(s, t)
    if (m >= 0 && m <= windowMin) out.push({ item, age: m / windowMin })
  }
  return out
}

function lerpPoint(a: TrackPoint, b: TrackPoint, t: Instant, role: TemporalRole): TrackPoint {
  const f = (epoch(t) - epoch(a.validAt)) / (epoch(b.validAt) - epoch(a.validAt))
  // Interpolate longitude along the shorter arc.
  let dLon = b.lon - a.lon
  if (dLon > 180) dLon -= 360
  if (dLon < -180) dLon += 360
  const lon = a.lon + dLon * f
  return {
    validAt: t,
    lat: a.lat + (b.lat - a.lat) * f,
    lon: lon >= 180 ? lon - 360 : lon < -180 ? lon + 360 : lon,
    pressureHpa: a.pressureHpa,
    role,
  }
}

function interpolateWithin(
  points: TrackPoint[],
  t: Instant,
  role: TemporalRole,
): TrackPoint | null {
  const ms = epoch(t)
  const sorted = [...points].sort((x, y) => epoch(x.validAt) - epoch(y.validAt))
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!
    if (epoch(p.validAt) === ms) return p
    const q = sorted[i + 1]
    if (q && epoch(p.validAt) < ms && ms < epoch(q.validAt)) return lerpPoint(p, q, t, role)
  }
  return null
}

/**
 * Cyclone position at t. Past/present: interpolate the observed track.
 * Future: interpolate within ONE forecast issue (the newest issued at or
 * before t) — points from different issuances are never joined.
 */
export function cyclonePositionAt(
  observedTrack: TrackPoint[],
  forecasts: ForecastIssue[],
  t: Instant,
): TrackPoint | null {
  const obs = interpolateWithin(observedTrack, t, 'observed')
  if (obs) return obs
  const ms = epoch(t)
  const issue = [...forecasts]
    .filter((f) => epoch(f.issuedAt) <= ms)
    .sort((a, b) => epoch(b.issuedAt) - epoch(a.issuedAt))[0]
  if (!issue) return null
  // Only this issue's own points (its analysis + forecasts) are joined.
  return interpolateWithin(issue.points, t, 'forecast')
}
