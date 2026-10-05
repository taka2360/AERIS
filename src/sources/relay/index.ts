/**
 * Client for the AERIS relay Worker (relay/): NASA FIRMS detections and NOAA
 * NHC storms, both served from the relay's cron snapshots. Without
 * VITE_RELAY_BASE the channels report NOT CONFIGURED (they are optional).
 */
import { z } from 'zod'
import type { FirmsFeed, NhcFeed } from '@/domain/earth/reports'
import type { SourceId } from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import { toInstant } from '@/domain/time'
import { fetchSourceResult } from '../http'

export const relayBase = (): string | null =>
  (import.meta.env.VITE_RELAY_BASE as string | undefined)?.replace(/\/$/, '') || null

function notConfigured<T>(source: SourceId): SourceResult<T> {
  return {
    ok: false,
    source,
    error: { kind: 'not_configured', message: 'relay not configured', retryable: false },
  }
}

const firmsSchema = z.object({
  fetchedAt: z.string(),
  total: z.number(),
  rows: z.array(
    z.tuple([
      z.number(),
      z.number(),
      z.number().nullable(),
      z.enum(['l', 'n', 'h']),
      z.string(),
      z.string(),
      z.enum(['D', 'N']),
    ]),
  ),
})

const CONF = { l: 'low', n: 'nominal', h: 'high' } as const

export function adaptFirms(raw: z.infer<typeof firmsSchema>): FirmsFeed {
  return {
    fetchedAt: toInstant(Date.parse(raw.fetchedAt)),
    total: raw.total,
    detections: raw.rows.map(([lat, lon, frp, conf, at, sat, dn], i) => ({
      id: `${sat}:${at}:${i}`,
      lat,
      lon,
      detectedAt: toInstant(Date.parse(at)),
      frpMw: frp,
      confidence: CONF[conf],
      satellite: sat,
      daynight: dn,
    })),
  }
}

export async function fetchFirms(
  bbox: [number, number, number, number],
  signal?: AbortSignal,
): Promise<SourceResult<FirmsFeed>> {
  const base = relayBase()
  if (!base) return notConfigured('relay-firms')
  return fetchSourceResult(
    'relay-firms',
    `${base}/firms?bbox=${bbox.join(',')}&hours=24&limit=3000`,
    firmsSchema,
    (raw, retrievedAt) => {
      const data = adaptFirms(raw)
      return {
        data,
        provenance: {
          source: 'relay-firms',
          kind: 'observation',
          label: 'NASA FIRMS VIIRS (via relay)',
          observedAt: data.fetchedAt,
          retrievedAt,
          role: 'observed',
          derivation: 'measured',
          quality: 'preliminary',
          sourceRole: 'observation',
        },
      }
    },
    { signal, timeoutMs: 20_000 },
  )
}

const nhcSchema = z.object({
  fetchedAt: z.string(),
  storms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      classification: z.string(),
      intensityKt: z.number().nullable(),
      pressureMb: z.number().nullable(),
      lat: z.number(),
      lon: z.number(),
      movementDir: z.number().nullable(),
      movementSpeedKt: z.number().nullable(),
      lastUpdate: z.string(),
    }),
  ),
})

export async function fetchNhc(signal?: AbortSignal): Promise<SourceResult<NhcFeed>> {
  const base = relayBase()
  if (!base) return notConfigured('relay-nhc')
  return fetchSourceResult(
    'relay-nhc',
    `${base}/nhc`,
    nhcSchema,
    (raw, retrievedAt) => {
      const fetchedAt = toInstant(Date.parse(raw.fetchedAt))
      return {
        data: { fetchedAt, storms: raw.storms },
        provenance: {
          source: 'relay-nhc',
          kind: 'official',
          label: 'NOAA NHC (via relay)',
          observedAt: fetchedAt,
          retrievedAt,
          role: 'analysis',
          sourceRole: 'forecast',
        },
      }
    },
    { signal },
  )
}
