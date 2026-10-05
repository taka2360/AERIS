/**
 * Cross-source association. Two records are never "the same" by fiat: each
 * pair gets a confidence and the evidence behind it, and matching is
 * one-to-one. Ambiguous pairs (several plausible partners) are downgraded
 * to 'related' — missing a merge is safer than merging two earthquakes.
 */
import type { SourceObservation, SourceRef } from '@/domain/earth/common'

export type AssociationRelation = 'same-event' | 'related' | 'distinct'

export type EventAssociation<E = Record<string, number | boolean | null>> = {
  a: SourceRef
  b: SourceRef
  relation: AssociationRelation
  confidence: number
  evidence: E & { ambiguous?: boolean }
  method: string
}

export const SAME_EVENT_MIN = 0.9
export const RELATED_MIN = 0.6

export type Scorer<T, E> = (
  a: SourceObservation<T>,
  b: SourceObservation<T>,
) => { confidence: number; evidence: E }

/**
 * Greedy one-to-one matching of `as` against `bs` by descending confidence.
 * A pair is 'same-event' only when its confidence clears the threshold AND
 * neither side has a competing partner that also clears it.
 */
export function associate<T, E extends Record<string, number | boolean | null>>(
  as: SourceObservation<T>[],
  bs: SourceObservation<T>[],
  score: Scorer<T, E>,
  method: string,
): EventAssociation<E>[] {
  type Pair = { i: number; j: number; confidence: number; evidence: E }
  const pairs: Pair[] = []
  for (let i = 0; i < as.length; i++)
    for (let j = 0; j < bs.length; j++) {
      const s = score(as[i]!, bs[j]!)
      if (s.confidence >= RELATED_MIN) pairs.push({ i, j, ...s })
    }
  pairs.sort((x, y) => y.confidence - x.confidence)

  const strongA = new Map<number, number>()
  const strongB = new Map<number, number>()
  for (const p of pairs)
    if (p.confidence >= SAME_EVENT_MIN) {
      strongA.set(p.i, (strongA.get(p.i) ?? 0) + 1)
      strongB.set(p.j, (strongB.get(p.j) ?? 0) + 1)
    }

  const usedA = new Set<number>()
  const usedB = new Set<number>()
  const out: EventAssociation<E>[] = []
  for (const p of pairs) {
    const a = as[p.i]!
    const b = bs[p.j]!
    const ref = {
      a: { source: a.source, nativeId: a.nativeId },
      b: { source: b.source, nativeId: b.nativeId },
    }
    const ambiguous = (strongA.get(p.i) ?? 0) > 1 || (strongB.get(p.j) ?? 0) > 1
    const free = !usedA.has(p.i) && !usedB.has(p.j)
    const same = free && !ambiguous && p.confidence >= SAME_EVENT_MIN
    if (same) {
      usedA.add(p.i)
      usedB.add(p.j)
    }
    out.push({
      ...ref,
      relation: same ? 'same-event' : 'related',
      confidence: p.confidence,
      evidence: ambiguous ? { ...p.evidence, ambiguous: true } : p.evidence,
      method,
    })
  }
  return out
}

/** Smooth tolerance: 1 within `free`, then a Gaussian fall-off of width `scale`. */
export function tolerance(delta: number, free: number, scale: number): number {
  const over = Math.max(0, Math.abs(delta) - free)
  return Math.exp(-((over / scale) ** 2))
}
