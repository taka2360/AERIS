/**
 * JMA volcanoes (bosai/volcano): the catalogue of monitored volcanoes and the
 * latest eruption warning / forecast for those with one in force or recently
 * changed. Volcanoes absent from warning.json have no bulletin listed —
 * AERIS does not invent a level for them.
 */
import { z } from 'zod'
import type { SourceObservation } from '@/domain/earth/common'
import type { VolcanoSite } from '@/domain/earth/events'
import type { SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { fetchValidated, memoized } from '../http'

const BASE = 'https://www.jma.go.jp/bosai/volcano'

export const listSchema = z.array(
  z.object({
    code: z.string(),
    // Aggregate entries ('全国の活火山', 'その他の活火山') have no position.
    latlon: z.tuple([z.string(), z.string()]).optional(),
    name_jp: z.string(),
    name_en: z.string().optional(),
  }),
)

const item = z.object({
  name: z.string(),
  code: z.string(),
  lastCode: z.string().optional(),
  condition: z.string().optional(),
  areas: z.array(z.object({ name: z.string(), code: z.string() })),
})

export const warningSchema = z.array(
  z.object({
    reportDatetime: z.string(),
    eventId: z.string(),
    volcanoInfos: z.array(z.object({ type: z.string(), items: z.array(item) })),
  }),
)

/** One volcano's latest bulletin as JMA stated it. */
export type VolcanoReport = {
  site: VolcanoSite
  issuedAt: Instant
  levelCode: string
  levelName: string
  lastCode?: string
  condition?: string
  /** 'municipality: response' lines */
  municipalities: string[]
}

/** JMA code → AERIS rank (eruption alert level codes map to their level). */
export function volcanoRank(code: string): number {
  const n = Number(code)
  if (n >= 11 && n <= 15) return n - 10
  if (code === '21') return 4 // 噴火警報(居住地域)
  if (code === '22' || code === '36') return 2 // 火口周辺 / 周辺海域
  return 1
}

export function alertLevelOf(code: string): number | undefined {
  const n = Number(code)
  return n >= 11 && n <= 15 ? n - 10 : undefined
}

/** Volcanoes with a position; aggregate catalogue entries are skipped. */
export function adaptSites(list: z.infer<typeof listSchema>): VolcanoSite[] {
  return list.flatMap((v) =>
    v.latlon
      ? [
          {
            code: v.code,
            name: v.name_jp,
            nameEn: v.name_en,
            lat: Number(v.latlon[0]),
            lon: Number(v.latlon[1]),
          },
        ]
      : [],
  )
}

export function adaptWarnings(
  warnings: z.infer<typeof warningSchema>,
  sites: VolcanoSite[],
): VolcanoReport[] {
  const byCode = new Map(sites.map((s) => [s.code, s]))
  const out: VolcanoReport[] = []
  for (const r of warnings) {
    const target = r.volcanoInfos.find((v) => v.type.includes('対象火山'))
    const response = r.volcanoInfos.find((v) => v.type.includes('防災対応'))
    for (const it of target?.items ?? [])
      for (const a of it.areas) {
        const site = byCode.get(a.code)
        if (!site) continue
        out.push({
          site,
          issuedAt: r.reportDatetime,
          levelCode: it.code,
          levelName: it.name,
          lastCode: it.lastCode,
          condition: it.condition,
          municipalities: (response?.items ?? []).flatMap((x) =>
            x.areas.map((m) => `${m.name}: ${x.name}`),
          ),
        })
      }
  }
  return out
}

export function volcanoObservation(
  r: VolcanoReport,
  retrievedAt: Instant,
): SourceObservation<VolcanoReport> {
  return {
    source: 'jma-volcano',
    nativeId: r.site.code,
    sourceRole: 'warning',
    time: { issuedAt: r.issuedAt, validFrom: r.issuedAt },
    data: r,
    provenance: {
      source: 'jma-volcano',
      kind: 'official',
      label: '気象庁 噴火警報・予報',
      issuedAt: r.issuedAt,
      retrievedAt,
      role: 'forecast',
      sourceRole: 'warning',
    },
  }
}

const loadSites = memoized(24 * 3600_000, async (signal) => {
  const r = await fetchValidated(`${BASE}/const/volcano_list.json`, listSchema, { signal })
  return r.ok ? { ok: true as const, data: adaptSites(r.data) } : r
})

export type VolcanoFeed = { sites: VolcanoSite[]; reports: SourceObservation<VolcanoReport>[] }

export async function fetchVolcanoes(signal?: AbortSignal): Promise<SourceResult<VolcanoFeed>> {
  const [sites, warnings] = await Promise.all([
    loadSites(signal),
    fetchValidated(`${BASE}/data/warning.json`, warningSchema, { signal }),
  ])
  if (!sites.ok) return { ok: false, source: 'jma-volcano', error: sites.error }
  if (!warnings.ok) return { ok: false, source: 'jma-volcano', error: warnings.error }
  const retrievedAt = toInstant(Date.now())
  return {
    ok: true,
    data: {
      sites: sites.data,
      reports: adaptWarnings(warnings.data, sites.data).map((r) =>
        volcanoObservation(r, retrievedAt),
      ),
    },
    provenance: {
      source: 'jma-volcano',
      kind: 'official',
      label: '気象庁 噴火警報・予報',
      retrievedAt,
      sourceRole: 'warning',
    },
  }
}
