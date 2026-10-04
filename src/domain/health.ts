/**
 * Source health — connectivity, freshness and validity are tracked separately
 * and only collapsed into a single DATA STATUS for display.
 */
import type { SourceId } from './model'
import type { Instant } from './time'

export type Connectivity = 'online' | 'offline' | 'unknown'
export type Freshness = 'fresh' | 'stale' | 'none'
export type Validity = 'valid' | 'invalid' | 'unknown'

export type SourceHealth = {
  source: SourceId
  connectivity: Connectivity
  /** Based on the data's own timestamp, not the fetch time */
  freshness: Freshness
  validity: Validity
  fetching: boolean
  lastSuccessAt?: Instant
  /** Timestamp of the data itself (observation / issue time) */
  dataTime?: Instant
  errorMessage?: string
}

/** Display-level status for a channel or the whole system. */
export type LinkStatus = 'online' | 'syncing' | 'degraded' | 'stale' | 'offline' | 'standby'

/** Collapse one source's health into a display status. */
export function linkStatusOf(h: SourceHealth): LinkStatus {
  if (h.connectivity === 'unknown' && h.freshness === 'none')
    return h.fetching ? 'syncing' : 'standby'
  if (h.validity === 'invalid') return 'degraded'
  if (h.connectivity === 'offline') return h.freshness === 'none' ? 'offline' : 'stale'
  if (h.freshness === 'stale') return 'stale'
  if (h.fetching && h.freshness === 'none') return 'syncing'
  return 'online'
}

/**
 * Overall system status. `critical` sources (weather core) dominate;
 * failure of auxiliary sources only degrades.
 */
export function aggregateStatus(healths: SourceHealth[], critical: SourceId[]): LinkStatus {
  if (healths.length === 0) return 'standby'
  const statuses = healths.map((h) => ({
    s: linkStatusOf(h),
    critical: critical.includes(h.source),
  }))
  const crit = statuses.filter((x) => x.critical)
  if (crit.length > 0 && crit.every((x) => x.s === 'offline')) return 'offline'
  if (
    crit.some((x) => x.s === 'syncing' || x.s === 'standby') &&
    statuses.every((x) => x.s !== 'online')
  )
    return 'syncing'
  if (crit.some((x) => x.s === 'stale')) return 'stale'
  if (statuses.some((x) => x.s === 'offline' || x.s === 'degraded' || x.s === 'stale'))
    return 'degraded'
  if (statuses.some((x) => x.s === 'syncing')) return 'syncing'
  return 'online'
}
