/**
 * Position ↔ time mapping of the map's time scrubber. The present sits at the
 * centre of the track. The future half is linear (it is short: the nowcast
 * reaches ~1 hour). The past half is a power curve: fine near now, rewinding
 * ever faster towards the far end, so 24 hours of earthquakes do not squeeze
 * the next hour of radar into a sliver.
 *
 * Positions are in [-1, 1] (0 = now). Without any future span the whole track
 * is past ([-1, 0]).
 */

/** Exponent of the past half when the past is much longer than the future */
export const PAST_CURVE = 2.5

export type ScrubScale = {
  /** Minutes of past / future covered */
  pastMin: number
  futureMin: number
  /** Exponent applied to the past half */
  k: number
  /** Lowest / highest position */
  min: number
  max: number
}

export function scrubScale(pastMin: number, futureMin: number): ScrubScale {
  const past = Math.max(0, pastMin)
  const future = Math.max(0, futureMin)
  // A past no longer than the future reads fine linearly.
  const k = past <= future * 1.5 ? 1 : PAST_CURVE
  return { pastMin: past, futureMin: future, k, min: past > 0 ? -1 : 0, max: future > 0 ? 1 : 0 }
}

/** Track position → minutes from now (negative = past). */
export function positionToOffset(sc: ScrubScale, p: number): number {
  const x = Math.min(sc.max, Math.max(sc.min, p))
  return x >= 0 ? x * sc.futureMin : -sc.pastMin * Math.pow(-x, sc.k)
}

/** Minutes from now → track position (clamped to the track). */
export function offsetToPosition(sc: ScrubScale, offsetMin: number): number {
  if (offsetMin >= 0) return sc.futureMin > 0 ? Math.min(1, offsetMin / sc.futureMin) : 0
  if (sc.pastMin <= 0) return 0
  return -Math.pow(Math.min(1, -offsetMin / sc.pastMin), 1 / sc.k)
}

/** Track position as a percentage of the track width (for ticks, gradients). */
export function positionPct(sc: ScrubScale, p: number): number {
  const span = sc.max - sc.min
  return span > 0 ? ((p - sc.min) / span) * 100 : 50
}

/**
 * Keyboard step from an offset: 5-minute steps near now, growing with the
 * distance (about a tenth of it) so the far past is reachable in a few presses.
 */
export function keyStep(offsetMin: number, stepMin: number): number {
  return Math.max(stepMin, Math.round((Math.abs(offsetMin) * 0.1) / stepMin) * stepMin)
}

/** Scale labels: offsets (min) worth naming, kept when inside the span. */
export function scaleMarks(
  sc: ScrubScale,
): Array<{ offset: number; label: string; minor?: boolean }> {
  // −15M crowds −1H on the curved scale; name it only on a linear one.
  const past = [-1440, -720, -360, -180, -60, ...(sc.k === 1 ? [-30, -15] : [])]
    .filter((m) => -m <= sc.pastMin)
    .map((m) => ({
      offset: m,
      label: m <= -60 ? `−${-m / 60}H` : `−${-m}M`,
      // Dropped first when the track is narrow
      minor: m === -720 || m === -180 || m === -30,
    }))
  const future = [30, 60, 120]
    .filter((m) => m <= sc.futureMin)
    .map((m) => ({ offset: m, label: m >= 60 ? `+${m / 60}H` : `+${m}M` }))
  return [...past, { offset: 0, label: 'NOW' }, ...future]
}
