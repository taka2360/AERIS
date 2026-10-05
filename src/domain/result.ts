/**
 * The result of asking one data source for data. Sources never throw;
 * they report failures with enough detail to judge retryability and health.
 */
import type { Provenance, SourceId } from './model'

export type SourceErrorKind =
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid_response'
  | 'aborted'
  /** An optional source (e.g. the relay) is not set up in this deployment */
  | 'not_configured'

export type SourceError = {
  kind: SourceErrorKind
  message: string
  retryable: boolean
  httpStatus?: number
}

export type SourceResult<T> =
  | { ok: true; data: T; provenance: Provenance }
  | { ok: false; error: SourceError; source: SourceId }

/** Thrown at the query boundary so TanStack Query can retry and keep last-good data. */
export class SourceFailure extends Error {
  readonly source: SourceId
  readonly detail: SourceError

  constructor(source: SourceId, detail: SourceError) {
    super(`[${source}] ${detail.kind}: ${detail.message}`)
    this.name = 'SourceFailure'
    this.source = source
    this.detail = detail
  }
}

export function unwrap<T>(result: SourceResult<T>): { data: T; provenance: Provenance } {
  if (!result.ok) throw new SourceFailure(result.source, result.error)
  return { data: result.data, provenance: result.provenance }
}
