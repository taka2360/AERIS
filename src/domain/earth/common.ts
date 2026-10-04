/**
 * Shared axes for Earth-observation data. Each axis answers exactly one
 * question; they are combined (never merged into one enum) for display.
 *
 *   TemporalRole — where the value sits in time relative to its issuance
 *   Derivation   — how the value was produced
 *   DataQuality  — how final the value is
 *   DecodeStatus — whether AERIS could interpret the payload at all
 *   SourceRole   — what kind of statement the source is making
 */
import type { Provenance, SourceId } from '../model'
import type { Instant } from '../time'

export type TemporalRole = 'observed' | 'nowcast' | 'analysis' | 'forecast'
export type Derivation = 'measured' | 'derived' | 'estimated' | 'modeled'
export type DataQuality = 'preliminary' | 'confirmed'
export type DecodeStatus = 'decoded' | 'not-decoded' | 'partial'
export type SourceRole = 'observation' | 'forecast' | 'warning' | 'assessment' | 'aggregation'

/**
 * Every time a record can carry. Issuance and validity are never conflated:
 * a forecast issued at 12:00 for 18:00 has issuedAt=12:00, validFrom=18:00.
 */
export type TimeFrame = {
  issuedAt?: Instant
  observedAt?: Instant
  validFrom?: Instant
  validUntil?: Instant
  startedAt?: Instant
  endedAt?: Instant
}

/** Pointer to one record of one source. */
export type SourceRef = { source: SourceId; nativeId: string }

export const refKey = (r: SourceRef) => `${r.source}:${r.nativeId}`

/**
 * A normalised record exactly as one source stated it — before any fusion.
 * Canonical objects are built from these and keep references back to them.
 */
export type SourceObservation<T> = {
  source: SourceId
  nativeId: string
  sourceRole: SourceRole
  time: TimeFrame
  data: T
  provenance: Provenance
}

/**
 * A value AERIS computed (rather than read). Records the inputs and the rule,
 * so a derived colour or level can always be explained.
 */
export type DerivedFieldSource = {
  sources: SourceRef[]
  method: string
  version?: string
}

/** A quantitative attribute of an event, namespaced by kind. */
export type EventMeasure = {
  kind: `${string}.${string}`
  value: number
  unit?: string
  /** Free-form qualifier within the kind, e.g. 'Mj', 'Mw', 'mb' */
  variant?: string
  role: TemporalRole
  provenance: Provenance
}

export type GeoPoint = { lat: number; lon: number }

export type Geometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'MultiPoint'; coordinates: [number, number][] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon'; coordinates: [number, number][][] }

export const point = (lat: number, lon: number): Geometry => ({
  type: 'Point',
  coordinates: [normalizeLon(lon), lat],
})

/** Longitude into [-180, 180). Accepts 0–360 inputs (e.g. SWPC OVATION grids). */
export function normalizeLon(lon: number): number {
  const x = (((lon + 180) % 360) + 360) % 360
  return x - 180
}

/**
 * Split a polyline where it crosses the antimeridian so no segment wraps
 * the whole globe. Returns one or more lines in [-180, 180).
 */
export function splitAtAntimeridian(coords: [number, number][]): [number, number][][] {
  const out: [number, number][][] = []
  let cur: [number, number][] = []
  for (const [rawLon, lat] of coords) {
    const lon = normalizeLon(rawLon)
    const prev = cur.at(-1)
    if (prev && Math.abs(lon - prev[0]) > 180) {
      // Interpolate the crossing latitude and close/open at ±180.
      const east = prev[0] > 0
      const dLon = east ? lon + 360 - prev[0] : lon - 360 - prev[0]
      const f = ((east ? 180 : -180) - prev[0]) / dLon
      const latX = prev[1] + (lat - prev[1]) * f
      cur.push([east ? 180 : -180, latX])
      out.push(cur)
      cur = [[east ? -180 : 180, latX]]
    }
    cur.push([lon, lat])
  }
  if (cur.length > 0) out.push(cur)
  return out
}
