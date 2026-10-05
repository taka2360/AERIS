/** Pure geometry helpers for map overlays (GeoJSON). */
import type { WindSample } from '@/domain/model'

const R = 6371

/** Point at `distanceKm` from (lat, lon) on `bearingDeg`. */
export function destination(lat: number, lon: number, bearingDeg: number, distanceKm: number) {
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lon * Math.PI) / 180
  const θ = (bearingDeg * Math.PI) / 180
  const δ = distanceKm / R
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: (φ2 * 180) / Math.PI, lon: (λ2 * 180) / Math.PI }
}

export function ringsGeoJSON(lat: number, lon: number, radiiKm: number[], steps = 96) {
  return {
    type: 'FeatureCollection' as const,
    features: radiiKm.flatMap((r) => {
      const coords = Array.from({ length: steps + 1 }, (_, i) => {
        const p = destination(lat, lon, (i / steps) * 360, r)
        return [p.lon, p.lat]
      })
      const label = destination(lat, lon, 45, r)
      return [
        {
          type: 'Feature' as const,
          properties: { r },
          geometry: { type: 'LineString' as const, coordinates: coords },
        },
        {
          type: 'Feature' as const,
          properties: { label: `${r}KM` },
          geometry: { type: 'Point' as const, coordinates: [label.lon, label.lat] },
        },
      ]
    }),
  }
}

export function windGeoJSON(samples: WindSample[]) {
  return {
    type: 'FeatureCollection' as const,
    features: samples.map((w, i) => ({
      type: 'Feature' as const,
      id: i,
      properties: { speed: w.speed, direction: w.direction, major: w.major ?? false },
      geometry: { type: 'Point' as const, coordinates: [w.lon, w.lat] },
    })),
  }
}

/** Bounding box [[w, s], [e, n]] of a circle — for fitting the view to a range. */
export function circleBounds(
  lat: number,
  lon: number,
  radiusKm: number,
): [[number, number], [number, number]] {
  const n = destination(lat, lon, 0, radiusKm)
  const e = destination(lat, lon, 90, radiusKm)
  const s = destination(lat, lon, 180, radiusKm)
  const w = destination(lat, lon, 270, radiusKm)
  return [
    [w.lon, s.lat],
    [e.lon, n.lat],
  ]
}
