/**
 * One quota for every Open-Meteo API (forecast, marine, air, flood, geocoding):
 * the free tier limits calls per IP — 600 / minute, 5,000 / hour,
 * 10,000 / day — and a multi-location request counts once per location.
 * The client stays a little under each limit; map decoration (bulk) leaves
 * room for the panels, which need only a few calls per poll.
 */
import { RateGate } from './rate-gate'

const MIN = 60_000

export const openMeteoGate = new RateGate({
  windows: [
    { ms: MIN, limit: 560, bulkLimit: 480 },
    { ms: 60 * MIN, limit: 4_600, bulkLimit: 4_000 },
    { ms: 24 * 60 * MIN, limit: 9_200, bulkLimit: 8_000 },
  ],
  cooldownMs: MIN,
})

/**
 * Weight of one request as Open-Meteo counts it: one call per location, more
 * for over 10 variables or over two weeks of data.
 */
export function openMeteoCost(locations: number, variables = 1, days = 1): number {
  return locations * Math.max(1, variables / 10) * Math.max(1, days / 14)
}

export const openMeteoQuota = (locations: number, variables?: number, days?: number) => ({
  gate: openMeteoGate,
  cost: openMeteoCost(locations, variables, days),
})
