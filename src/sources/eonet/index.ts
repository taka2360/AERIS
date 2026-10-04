/**
 * NASA EONET v3: a catalogue that TRACKS natural events reported by other
 * agencies (JTWC, InciWeb, NIFC, US NIC …). It is an aggregation, not an
 * impact assessment; each event keeps its dated geometry trail.
 */
import { z } from 'zod'
import { normalizeLon, type SourceObservation } from '@/domain/earth/common'
import type { SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { fetchValidated } from '../http'

const URL_OPEN = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30'

export const eonetSchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable().optional(),
      link: z.string().optional(),
      closed: z.string().nullable().optional(),
      categories: z.array(z.object({ id: z.string(), title: z.string() })),
      sources: z.array(z.object({ id: z.string(), url: z.string().optional() })),
      geometry: z.array(
        z.object({
          magnitudeValue: z.number().nullable().optional(),
          magnitudeUnit: z.string().nullable().optional(),
          date: z.string(),
          type: z.string(),
          coordinates: z.unknown(),
        }),
      ),
    }),
  ),
})

export type EonetPoint = {
  at: Instant
  lat: number
  lon: number
  magnitude?: { value: number; unit: string }
}

export type EonetEvent = {
  id: string
  title: string
  description?: string
  link?: string
  category: string
  categoryTitle: string
  /** Agencies that reported it (EONET does not observe by itself) */
  reporters: string[]
  closedAt?: Instant
  /** Dated positions; polygons are reduced to their first vertex */
  track: EonetPoint[]
}

function firstPosition(c: unknown): [number, number] | null {
  if (!Array.isArray(c)) return null
  if (typeof c[0] === 'number' && typeof c[1] === 'number') return [c[0], c[1]]
  return firstPosition(c[0])
}

export function adaptEonet(raw: z.infer<typeof eonetSchema>): EonetEvent[] {
  return raw.events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description ?? undefined,
    link: e.link,
    category: e.categories[0]?.id ?? 'other',
    categoryTitle: e.categories[0]?.title ?? 'Other',
    reporters: e.sources.map((s) => s.id),
    closedAt: e.closed ? toInstant(Date.parse(e.closed)) : undefined,
    track: e.geometry.flatMap((g) => {
      const p = firstPosition(g.coordinates)
      if (!p) return []
      return [
        {
          at: toInstant(Date.parse(g.date)),
          lon: normalizeLon(p[0]),
          lat: p[1],
          magnitude:
            g.magnitudeValue != null && g.magnitudeUnit
              ? { value: g.magnitudeValue, unit: g.magnitudeUnit }
              : undefined,
        },
      ]
    }),
  }))
}

export function eonetObservation(
  e: EonetEvent,
  retrievedAt: Instant,
): SourceObservation<EonetEvent> {
  return {
    source: 'eonet',
    nativeId: e.id,
    sourceRole: 'aggregation',
    time: { startedAt: e.track[0]?.at, observedAt: e.track.at(-1)?.at, endedAt: e.closedAt },
    data: e,
    provenance: {
      source: 'eonet',
      kind: 'observation',
      label: `NASA EONET (${e.reporters.join(', ') || 'n/a'})`,
      observedAt: e.track.at(-1)?.at,
      retrievedAt,
      role: 'observed',
      derivation: 'derived',
      sourceRole: 'aggregation',
    },
  }
}

export async function fetchEonet(
  signal?: AbortSignal,
): Promise<SourceResult<SourceObservation<EonetEvent>[]>> {
  const r = await fetchValidated(URL_OPEN, eonetSchema, { signal, timeoutMs: 25_000 })
  if (!r.ok) return { ok: false, source: 'eonet', error: r.error }
  const retrievedAt = toInstant(Date.now())
  return {
    ok: true,
    data: adaptEonet(r.data).map((e) => eonetObservation(e, retrievedAt)),
    provenance: {
      source: 'eonet',
      kind: 'observation',
      label: 'NASA EONET',
      retrievedAt,
      sourceRole: 'aggregation',
    },
  }
}
