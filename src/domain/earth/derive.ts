/**
 * AERIS's own judgements. Everything here is DERIVED: it is computed from
 * source values by a named rule and must never be presented as an
 * authority's statement. Each result carries the rule and its inputs.
 */
import type { DerivedFieldSource } from './common'
import type { EarthquakeEvent, NaturalEvent } from './events'

export type ImpactSeverity = 'none' | 'minor' | 'moderate' | 'severe' | 'extreme'

export const SEVERITY_RANK: Record<ImpactSeverity, number> = {
  none: 0,
  minor: 1,
  moderate: 2,
  severe: 3,
  extreme: 4,
}

export type Derived<T> = { value: T; derivedFrom: DerivedFieldSource }

/** System status of one observation domain, as shown on the event monitor. */
export type SystemStatus = 'nominal' | 'active' | 'elevated' | 'warning' | 'critical' | 'unknown'

export const SYSTEM_STATUS_LABEL: Record<SystemStatus, string> = {
  nominal: 'NOMINAL',
  active: 'ACTIVE',
  elevated: 'ELEVATED',
  warning: 'WARNING',
  critical: 'CRITICAL',
  unknown: 'NO DATA',
}

export const SYSTEM_STATUS_RANK: Record<SystemStatus, number> = {
  unknown: -1,
  nominal: 0,
  active: 1,
  elevated: 2,
  warning: 3,
  critical: 4,
}

/** JMA seismic-intensity classes in order. */
const INTENSITY_ORDER = ['0', '1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'] as const

/** Ordinal of a JMA intensity class (-1 when unknown). Accepts '5弱' style too. */
export function intensityRank(s: string | undefined): number {
  if (!s) return -1
  const norm = s.replace('弱', '-').replace('強', '+').trim()
  return INTENSITY_ORDER.indexOf(norm as (typeof INTENSITY_ORDER)[number])
}

export function intensityLabel(s: string | undefined): string {
  if (!s) return '--'
  return s.replace('-', '弱').replace('+', '強')
}

type Steps = Array<[min: number, severity: ImpactSeverity]>

/** First step whose minimum the value reaches; steps are listed high → low. */
function byThreshold(v: number, steps: Steps): ImpactSeverity {
  return steps.find(([min]) => v >= min)?.[1] ?? 'none'
}

/** Ranks into INTENSITY_ORDER: 6強+ → extreme, 5弱+ → severe, 4 → moderate, 2+ → minor. */
const INTENSITY_STEPS: Steps = [
  [8, 'extreme'],
  [5, 'severe'],
  [4, 'moderate'],
  [2, 'minor'],
]

const MAGNITUDE_STEPS: Steps = [
  [7.5, 'extreme'],
  [6.5, 'severe'],
  [5.5, 'moderate'],
  [4.5, 'minor'],
]

const QUAKE_RULE = 'aeris:quake-severity'
const QUAKE_RULE_VERSION = '1'

/**
 * Earthquake impact: JMA intensity when observed (it measures shaking where
 * people are); otherwise magnitude as a coarse proxy.
 */
export function quakeSeverity(e: EarthquakeEvent): Derived<ImpactSeverity> {
  const ir = intensityRank(e.detail.maxIntensity)
  const intensitySrc = e.fieldSources?.intensity?.sources ?? []
  if (ir >= 0) {
    const value = byThreshold(ir, INTENSITY_STEPS)
    return {
      value,
      derivedFrom: {
        sources: intensitySrc,
        method: `${QUAKE_RULE}/intensity`,
        version: QUAKE_RULE_VERSION,
      },
    }
  }
  const mags = e.measures.filter((m) => m.kind === 'earthquake.magnitude').map((m) => m.value)
  const value = mags.length ? byThreshold(Math.max(...mags), MAGNITUDE_STEPS) : 'none'
  return {
    value,
    derivedFrom: {
      sources: e.fieldSources?.magnitude?.sources ?? e.sources,
      method: `${QUAKE_RULE}/magnitude`,
      version: QUAKE_RULE_VERSION,
    },
  }
}

/** Severity of any event; categories without a rule yet return 'none'. */
export function eventSeverity(e: NaturalEvent): Derived<ImpactSeverity> {
  switch (e.category) {
    case 'earthquake':
      return quakeSeverity(e)
    default:
      return {
        value: 'none',
        derivedFrom: { sources: e.sources, method: 'aeris:no-rule', version: '1' },
      }
  }
}
