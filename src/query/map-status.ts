/**
 * Basemap subsystem status. The map is not a query, so it reports its own
 * health here and the system panel reads it like any other channel.
 */
import { useSyncExternalStore } from 'react'
import { toInstant, type Instant } from '@/domain/time'

export type MapStatus = {
  state: 'standby' | 'loading' | 'online' | 'degraded' | 'unsupported'
  detail?: string
  lastOkAt?: Instant
}

let status: MapStatus = { state: 'standby' }
const listeners = new Set<() => void>()

export function setMapStatus(next: Omit<MapStatus, 'lastOkAt'>): void {
  if (status.state === next.state && status.detail === next.detail) return
  status = {
    ...next,
    lastOkAt: next.state === 'online' ? toInstant(Date.now()) : status.lastOkAt,
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useMapStatus(): MapStatus {
  return useSyncExternalStore(subscribe, () => status)
}
