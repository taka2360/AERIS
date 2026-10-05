/**
 * Derive SourceHealth from the state of a data request.
 * Kept framework-agnostic: the query layer passes a plain snapshot.
 */
import type { SourceHealth } from '@/domain/health'
import type { SourceId } from '@/domain/model'
import { SourceFailure } from '@/domain/result'
import { minutesBetween, toInstant, type Instant } from '@/domain/time'

export type RequestSnapshot = {
  hasData: boolean
  dataUpdatedAt: number // epoch ms, 0 if never
  errorUpdatedAt: number
  error: unknown
  isFetching: boolean
  /** Consecutive failed attempts in the current fetch cycle (retries included) */
  failureCount?: number
  /** Timestamp of the data itself; falls back to dataUpdatedAt */
  dataTime?: Instant
}

export function healthFromSnapshot(
  source: SourceId,
  snap: RequestSnapshot,
  opts: { now: Instant; maxAgeMin: number; browserOnline: boolean },
): SourceHealth {
  // Optional sources that are not set up are on standby, not failing.
  if (
    snap.error instanceof SourceFailure &&
    snap.error.detail.kind === 'not_configured' &&
    !snap.hasData
  )
    return {
      source,
      connectivity: 'unknown',
      freshness: 'none',
      validity: 'unknown',
      fetching: false,
      errorMessage: 'NOT CONFIGURED',
    }
  const lastAttemptFailed =
    (snap.failureCount ?? 0) > 0 ||
    (snap.error != null && snap.errorUpdatedAt >= snap.dataUpdatedAt)
  const connectivity: SourceHealth['connectivity'] = !opts.browserOnline
    ? 'offline'
    : lastAttemptFailed
      ? 'offline'
      : snap.hasData
        ? 'online'
        : 'unknown'

  const invalid =
    snap.error instanceof SourceFailure && snap.error.detail.kind === 'invalid_response'
  const validity: SourceHealth['validity'] =
    invalid && lastAttemptFailed ? 'invalid' : snap.hasData ? 'valid' : 'unknown'

  const lastSuccessAt = snap.dataUpdatedAt > 0 ? toInstant(snap.dataUpdatedAt) : undefined
  const dataTime = snap.dataTime ?? lastSuccessAt
  const freshness: SourceHealth['freshness'] = !snap.hasData
    ? 'none'
    : dataTime && minutesBetween(dataTime, opts.now) > opts.maxAgeMin
      ? 'stale'
      : 'fresh'

  return {
    source,
    connectivity,
    freshness,
    validity,
    fetching: snap.isFetching,
    lastSuccessAt,
    dataTime,
    errorMessage: lastAttemptFailed ? errorMessage(snap.error) : undefined,
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof SourceFailure)
    return `${e.detail.kind.toUpperCase()}${e.detail.httpStatus ? ` ${e.detail.httpStatus}` : ''}`
  if (e instanceof Error) return e.message
  return 'UNKNOWN'
}
