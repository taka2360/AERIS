/**
 * Open-Meteo geocoding — used for romaji / English queries (it does not match
 * Japanese script input well; GSI address search handles those).
 */
import { z } from 'zod'
import type { PlaceCandidate } from '@/domain/model'
import { fetchValidated, type Fetched } from '../http'

const schema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        admin1: z.string().optional(),
        admin2: z.string().optional(),
      }),
    )
    .optional(),
})

export async function searchPlacesOpenMeteo(
  query: string,
  signal?: AbortSignal,
): Promise<Fetched<PlaceCandidate[]>> {
  const q = new URLSearchParams({ name: query, count: '8', language: 'ja', countryCode: 'JP' })
  const r = await fetchValidated(`https://geocoding-api.open-meteo.com/v1/search?${q}`, schema, {
    signal,
  })
  if (!r.ok) return r
  return {
    ok: true,
    data: (r.data.results ?? []).map((p) => ({
      name: p.name,
      admin: [p.admin1, p.admin2].filter(Boolean).join(' '),
      lat: p.latitude,
      lon: p.longitude,
    })),
  }
}
