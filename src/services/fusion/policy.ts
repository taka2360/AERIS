/**
 * Field policies — which source supplies which field of a canonical event.
 * Declarative data so the rule can be documented, tested and versioned.
 */
import type { SourceId } from '@/domain/model'

export type Region = { id: string; label: string; bbox: [number, number, number, number] }

/** JMA's area of responsibility for hypocentre determination (approx.). */
export const REGIONS: Region[] = [{ id: 'japan', label: '日本域', bbox: [120, 20, 156, 50] }]

export function regionOf(lat: number, lon: number): string {
  const r = REGIONS.find(({ bbox: [w, s, e, n] }) => lon >= w && lon <= e && lat >= s && lat <= n)
  return r?.id ?? 'global'
}

/** Ordered preference, or 'keep-all' to retain every source's value. */
export type FieldRule = SourceId[] | 'keep-all'

export type FieldPolicy = {
  method: string
  version: string
  byRegion: Record<string, Record<string, FieldRule>>
}

export const EARTHQUAKE_POLICY: FieldPolicy = {
  method: 'field-policy:earthquake',
  version: '1',
  byRegion: {
    japan: {
      hypocenter: ['jma-quake', 'usgs-quake'],
      intensity: ['jma-quake'],
      magnitude: 'keep-all',
      title: ['jma-quake', 'usgs-quake'],
    },
    global: {
      hypocenter: ['usgs-quake', 'jma-quake'],
      intensity: ['jma-quake'],
      magnitude: 'keep-all',
      title: ['usgs-quake', 'jma-quake'],
    },
  },
}

export function ruleFor(policy: FieldPolicy, region: string, field: string): FieldRule {
  return policy.byRegion[region]?.[field] ?? policy.byRegion.global?.[field] ?? 'keep-all'
}

/** Pick the first source in preference order that has a value. */
export function pick<T extends { source: SourceId }>(rule: FieldRule, candidates: T[]): T[] {
  if (rule === 'keep-all') return candidates
  for (const s of rule) {
    const hit = candidates.find((c) => c.source === s)
    if (hit) return [hit]
  }
  return []
}
