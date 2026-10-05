/**
 * Adaptive polling: each source polls at its nominal rate and speeds up only
 * while its declared `activeWhen` condition holds. The registry states the
 * condition as data; this module evaluates it against current signals.
 */
import { minutesBetween, type Instant } from '@/domain/time'
import type { ActiveWhen, SourceSpec } from '@/domain/source-spec'

/** Facts derived from current data that may warrant faster polling. */
export type EarthSignals = {
  /** Highest active tsunami assessment rank (0 = none) */
  tsunamiMaxRank?: number
  /** Most recent strong earthquake (by JMA intensity rank) */
  latestQuake?: { intensityRank: number; at: Instant }
  cycloneActive?: boolean
  kp?: number
}

export function conditionHolds(when: ActiveWhen, s: EarthSignals, now: Instant): boolean {
  switch (when.signal) {
    case 'tsunami-assessment':
      return (s.tsunamiMaxRank ?? 0) >= when.minRank
    case 'recent-earthquake':
      return (
        !!s.latestQuake &&
        s.latestQuake.intensityRank >= when.minIntensityRank &&
        minutesBetween(s.latestQuake.at, now) <= when.withinMin
      )
    case 'cyclone-active':
      return s.cycloneActive === true
    case 'geomagnetic':
      return (s.kp ?? 0) >= when.minKp
  }
}

/** Polling interval in ms; `false` disables polling (static resources). */
export function pollInterval(spec: SourceSpec, s: EarthSignals, now: Instant): number | false {
  const { nominalMs, activeMs, activeWhen } = spec.poll
  if (activeMs && activeWhen && conditionHolds(activeWhen, s, now)) return activeMs
  return nominalMs > 0 ? nominalMs : false
}
