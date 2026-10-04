/**
 * GDACS (UN OCHA / EC JRC): humanitarian-impact ASSESSMENTS of disasters,
 * Green / Orange / Red. Not observations — an EQ here is GDACS's view of an
 * earthquake that USGS / JMA measured.
 */
import { z } from 'zod'
import type { HazardAssessment } from '@/domain/earth/assessments'
import { normalizeLon } from '@/domain/earth/common'
import type { SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { fetchValidated } from '../http'

const URL_LIST =
  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;WF;DR&alertlevel=Green;Orange;Red'

export const gdacsSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({
        type: z.literal('Point'),
        coordinates: z.tuple([z.number(), z.number()]),
      }),
      properties: z.object({
        eventtype: z.string(),
        eventid: z.number(),
        episodeid: z.number().optional(),
        name: z.string(),
        description: z.string().optional(),
        alertlevel: z.string(),
        alertscore: z.number().optional(),
        country: z.string().optional(),
        fromdate: z.string(),
        todate: z.string().optional(),
        datemodified: z.string().optional(),
        iscurrent: z.string().optional(),
        url: z.object({ report: z.string().optional() }).optional(),
        severitydata: z
          .object({ severity: z.number().optional(), severitytext: z.string().optional() })
          .optional(),
      }),
    }),
  ),
})

export const GDACS_RANK: Record<string, number> = { Green: 1, Orange: 2, Red: 3 }

/** GDACS times have no zone and are UTC. */
const utc = (t: string): Instant => toInstant(Date.parse(/[zZ]$/.test(t) ? t : `${t}Z`))

export type GdacsAssessment = HazardAssessment & {
  values: { eventtype: string; lat: number; lon: number; severity?: string; report?: string }
}

export function adaptGdacs(
  raw: z.infer<typeof gdacsSchema>,
  retrievedAt: Instant,
): GdacsAssessment[] {
  return raw.features.map((f) => {
    const p = f.properties
    const [lon, lat] = f.geometry.coordinates
    const values: GdacsAssessment['values'] = {
      eventtype: p.eventtype,
      lat,
      lon: normalizeLon(lon),
    }
    if (p.severitydata?.severitytext) values.severity = p.severitydata.severitytext
    if (p.url?.report) values.report = p.url.report
    return {
      id: `gdacs:${p.eventtype}:${p.eventid}:${p.episodeid ?? 0}`,
      scheme: 'gdacs',
      level: { value: p.alertlevel, label: `GDACS ${p.alertlevel}` },
      rank: GDACS_RANK[p.alertlevel] ?? 0,
      area: { code: p.country, name: p.name },
      time: {
        issuedAt: p.datemodified ? utc(p.datemodified) : undefined,
        validFrom: utc(p.fromdate),
        validUntil: p.todate ? utc(p.todate) : undefined,
        startedAt: utc(p.fromdate),
      },
      status: p.iscurrent === 'false' ? 'cancelled' : 'issued',
      sourceRole: 'assessment',
      values,
      provenance: {
        source: 'gdacs',
        kind: 'official',
        label: 'GDACS',
        issuedAt: p.datemodified ? utc(p.datemodified) : undefined,
        retrievedAt,
        role: 'analysis',
        derivation: 'derived',
        sourceRole: 'assessment',
      },
    }
  })
}

export async function fetchGdacs(signal?: AbortSignal): Promise<SourceResult<GdacsAssessment[]>> {
  const r = await fetchValidated(URL_LIST, gdacsSchema, { signal, timeoutMs: 25_000 })
  if (!r.ok) return { ok: false, source: 'gdacs', error: r.error }
  const retrievedAt = toInstant(Date.now())
  return {
    ok: true,
    data: adaptGdacs(r.data, retrievedAt),
    provenance: {
      source: 'gdacs',
      kind: 'official',
      label: 'GDACS',
      retrievedAt,
      sourceRole: 'assessment',
    },
  }
}
