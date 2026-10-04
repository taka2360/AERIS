/**
 * JMA warnings/advisories, new format (r8). One office file holds several
 * bulletins (split by dataTypeCode); kinds for our class20 area are merged.
 */
import { z } from 'zod'
import type { AlertBulletin, WeatherAlert } from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import { epoch, toInstant, type Instant } from '@/domain/time'
import { fetchValidated } from '../http'
import { kindOf, KIND_DEFINITIONS_VERSION } from './kinds'

const kind = z.object({ code: z.string().optional(), status: z.string() })
const item = z.object({ areaCode: z.string(), kinds: z.array(kind) })
export const warningSchema = z.array(
  z.object({
    reportDatetime: z.string(),
    headlineText: z.string().optional(),
    dataTypeCode: z.string().optional(),
    warning: z.object({
      class10Items: z.array(item).optional(),
      class20Items: z.array(item).optional(),
    }),
  }),
)
export type WarningResponse = z.infer<typeof warningSchema>

const RANK = { advisory: 1, warning: 2, danger: 3, emergency: 4 } as const

function statusOf(s: string): WeatherAlert['status'] | null {
  if (s === '解除') return 'cancelled'
  if (s === '発表') return 'issued'
  if (s.includes('発表警報・注意報はなし')) return null
  // '継続', '特別警報から警報' etc. — still in force
  return 'continued'
}

export function adaptWarnings(
  r: WarningResponse,
  class20: string,
  areaName: string,
  retrievedAt: Instant,
): AlertBulletin {
  const byCode = new Map<string, WeatherAlert>()
  let issuedAt: Instant | undefined
  // Headline: from the bulletin carrying the most severe active kind for this area
  // (ties → most recent), not simply the latest bulletin for the office.
  let headline: string | undefined
  let headlineRank = 0
  let headlineAt = 0
  for (const bulletin of r) {
    const items = bulletin.warning.class20Items?.filter((i) => i.areaCode === class20) ?? []
    let topRank = 0
    for (const it of items) {
      for (const k of it.kinds) {
        const status = statusOf(k.status)
        if (!status || !k.code) continue
        const def = kindOf(k.code)
        if (!def) continue
        if (status !== 'cancelled') topRank = Math.max(topRank, RANK[def.severity])
        const prev = byCode.get(k.code)
        // A cancellation in one bulletin must not hide an active one in another.
        if (prev && prev.status !== 'cancelled' && status === 'cancelled') continue
        byCode.set(k.code, { id: k.code, ...def, status })
      }
    }
    const at = epoch(bulletin.reportDatetime)
    if (!issuedAt || at > epoch(issuedAt)) issuedAt = bulletin.reportDatetime
    const better = topRank > headlineRank || (topRank === headlineRank && at > headlineAt)
    if (topRank > 0 && bulletin.headlineText && better) {
      headline = bulletin.headlineText
      headlineRank = topRank
      headlineAt = at
    }
  }
  const alerts = [...byCode.values()].sort(
    (a, b) => RANK[b.severity] - RANK[a.severity] || (b.level ?? 0) - (a.level ?? 0),
  )
  return {
    areaName,
    headline,
    alerts,
    provenance: {
      source: 'jma-warning',
      kind: 'official',
      label: `JMA ${KIND_DEFINITIONS_VERSION}`,
      issuedAt,
      retrievedAt,
    },
  }
}

export async function fetchWarnings(
  office: string,
  class20: string,
  areaName: string,
  signal?: AbortSignal,
): Promise<SourceResult<AlertBulletin>> {
  const url = `https://www.jma.go.jp/bosai/warning/data/r8/${office}.json`
  const r = await fetchValidated(url, warningSchema, { signal })
  if (!r.ok) return { ok: false, source: 'jma-warning', error: r.error }
  const data = adaptWarnings(r.data, class20, areaName, toInstant(Date.now()))
  return { ok: true, data, provenance: data.provenance }
}
