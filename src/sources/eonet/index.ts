/**
 * NASA EONET v3: a catalogue that TRACKS natural events reported by other
 * agencies (JTWC, InciWeb, NIFC, US NIC …). It is an aggregation, not an
 * impact assessment; each event keeps its dated geometry trail.
 */
import { z } from 'zod'
import type { EonetEvent } from '@/domain/earth/reports'
import { normalizeLon, type SourceObservation } from '@/domain/earth/common'
import type { SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { fetchSourceResult } from '../http'

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
  return fetchSourceResult(
    'eonet',
    URL_OPEN,
    eonetSchema,
    (raw, retrievedAt) => ({
      data: adaptEonet(raw).map((e) => eonetObservation(e, retrievedAt)),
      provenance: {
        source: 'eonet',
        kind: 'observation',
        label: 'NASA EONET',
        retrievedAt,
        sourceRole: 'aggregation',
      },
    }),
    { signal, timeoutMs: 25_000 },
  )
}
