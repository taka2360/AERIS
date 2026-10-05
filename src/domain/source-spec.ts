/**
 * Contract types for a data source: the shape of one registry entry
 * (licence, freshness, polling). The entries themselves live in
 * src/sources/registry.ts; services and query read the shape from here.
 * Type-only: scripts/gen-data-sources.ts loads the registry with Node.
 */
import type { DataQuality, Derivation, SourceRole, TemporalRole } from './earth/common'
import type { SourceId } from './model'

export type SourceDomain =
  | 'weather'
  | 'seismic'
  | 'tsunami'
  | 'volcano'
  | 'atmosphere'
  | 'hydro'
  | 'ocean'
  | 'environment'
  | 'space'
  | 'global'
  | 'map'
  | 'geocode'
  | 'internal'

/** Declarative condition for switching to the active polling rate. */
export type ActiveWhen =
  | { signal: 'tsunami-assessment'; minRank: number }
  | { signal: 'recent-earthquake'; minIntensityRank: number; withinMin: number }
  | { signal: 'cyclone-active' }
  | { signal: 'geomagnetic'; minKp: number }

export type SourceSpec = {
  id: SourceId
  label: string
  owner: string
  domain: SourceDomain
  status: 'active' | 'planned' | 'unavailable'
  endpoints: string[]
  license: string
  attribution: { text: string; url?: string }
  redistribution: string
  apiKey: 'none' | 'relay-secret'
  /** Reachable directly from the browser */
  cors: boolean
  rateLimit?: string
  sourceRole: SourceRole
  defaultRole: TemporalRole
  derivation: Derivation
  defaultQuality?: DataQuality
  freshness: { expectedIntervalMin: number; staleAfterMin: number }
  poll: { nominalMs: number; activeMs?: number; activeWhen?: ActiveWhen }
  notes?: string
}
