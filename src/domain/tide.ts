/**
 * Tide reading of an hourly sea-level series: high / low waters (local
 * extrema refined by a parabola through the neighbouring hours) and whether
 * the level is rising or falling at a given time.
 */
import { epoch, toInstant, type Instant } from './time'

export type SeaLevelPoint = { time: Instant; level: number | null }
export type TideTurn = { time: Instant; level: number; kind: 'high' | 'low' }

export function tideTurns(points: SeaLevelPoint[]): TideTurn[] {
  const pts = points.filter((p): p is { time: Instant; level: number } => p.level != null)
  const out: TideTurn[] = []
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!.level
    const b = pts[i]!.level
    const c = pts[i + 1]!.level
    const high = b > a && b >= c
    const low = b < a && b <= c
    if (!high && !low) continue
    const curv = a - 2 * b + c
    // Vertex of the parabola through (−1, a), (0, b), (1, c), in steps.
    const dx = curv === 0 ? 0 : (a - c) / (2 * curv)
    const step = epoch(pts[i + 1]!.time) - epoch(pts[i]!.time)
    out.push({
      time: toInstant(Math.round((epoch(pts[i]!.time) + dx * step) / 60_000) * 60_000),
      level: Math.round((b - ((a - c) * dx) / 4) * 100) / 100,
      kind: high ? 'high' : 'low',
    })
  }
  return out
}

/** Linearly interpolated level at `t`, and its trend over the surrounding hour. */
export function tideAt(
  points: SeaLevelPoint[],
  t: Instant,
): { level: number; trend: 'rising' | 'falling' | 'steady' } | null {
  const ms = epoch(t)
  const pts = points.filter((p): p is { time: Instant; level: number } => p.level != null)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const ta = epoch(a.time)
    const tb = epoch(b.time)
    if (ms < ta || ms > tb) continue
    const f = tb === ta ? 0 : (ms - ta) / (tb - ta)
    const d = b.level - a.level
    return {
      level: Math.round((a.level + d * f) * 100) / 100,
      trend: Math.abs(d) < 0.01 ? 'steady' : d > 0 ? 'rising' : 'falling',
    }
  }
  return null
}
