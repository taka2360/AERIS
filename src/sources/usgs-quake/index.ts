/**
 * USGS earthquake GeoJSON summary feeds (public domain).
 * https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 */
import { z } from 'zod'
import { normalizeLon, type SourceObservation } from '@/domain/earth/common'
import type { QuakeSolution } from '@/domain/earth/reports'
import type { SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { fetchSourceResult } from '../http'

const BASE = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary'

export type UsgsFeed = '4.5_week' | '2.5_day' | 'significant_month' | 'all_hour'

export const feedSchema = z.object({
  metadata: z.object({ generated: z.number() }),
  features: z.array(
    z.object({
      id: z.string(),
      properties: z.object({
        mag: z.number().nullable(),
        magType: z.string().nullable(),
        place: z.string().nullable(),
        time: z.number(),
        updated: z.number(),
        url: z.string().optional(),
        status: z.string(),
        tsunami: z.number(),
        alert: z.string().nullable().optional(),
        type: z.string(),
      }),
      geometry: z.object({
        coordinates: z.tuple([z.number(), z.number(), z.number().nullable()]),
      }),
    }),
  ),
})

export function adaptFeed(
  feed: z.infer<typeof feedSchema>,
  retrievedAt: Instant,
): SourceObservation<QuakeSolution>[] {
  return feed.features
    .filter((f) => f.properties.type === 'earthquake')
    .map((f) => {
      const p = f.properties
      const [lon, lat, depth] = f.geometry.coordinates
      const originTime = toInstant(p.time)
      const reviewed = p.status === 'reviewed'
      return {
        source: 'usgs-quake' as const,
        nativeId: f.id,
        sourceRole: 'observation' as const,
        time: { startedAt: originTime, issuedAt: toInstant(p.updated) },
        data: {
          originTime,
          lat,
          lon: normalizeLon(lon),
          depthKm: depth,
          magnitude: p.mag == null ? null : { value: p.mag, type: p.magType ?? 'M' },
          areaName: p.place ?? undefined,
          tsunamiFlag: p.tsunami === 1,
          url: p.url,
        },
        provenance: {
          source: 'usgs-quake' as const,
          kind: 'observation' as const,
          label: `USGS ${reviewed ? 'REVIEWED' : 'AUTOMATIC'}`,
          observedAt: originTime,
          issuedAt: toInstant(p.updated),
          retrievedAt,
          role: 'observed' as const,
          derivation: 'measured' as const,
          quality: reviewed ? ('confirmed' as const) : ('preliminary' as const),
          sourceRole: 'observation' as const,
        },
      }
    })
}

export async function fetchUsgsQuakes(
  feed: UsgsFeed = '4.5_week',
  signal?: AbortSignal,
): Promise<SourceResult<SourceObservation<QuakeSolution>[]>> {
  return fetchSourceResult(
    'usgs-quake',
    `${BASE}/${feed}.geojson`,
    feedSchema,
    (raw, retrievedAt) => ({
      data: adaptFeed(raw, retrievedAt),
      provenance: {
        source: 'usgs-quake',
        kind: 'observation',
        label: `USGS ${feed}`,
        issuedAt: toInstant(raw.metadata.generated),
        retrievedAt,
        sourceRole: 'observation',
      },
    }),
    { signal },
  )
}
