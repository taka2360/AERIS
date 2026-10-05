/**
 * JMA weather information bulletins (bosai/information, r8 format): the list
 * of 気象解説情報 / 顕著な大雨に関する情報 etc. with their phenomena, issuing
 * area and validity. Each becomes a HazardAssessment (JMA's statement).
 */
import { z } from 'zod'
import type { HazardAssessment } from '@/domain/earth/assessments'
import type { SourceResult } from '@/domain/result'
import { epoch, type Instant } from '@/domain/time'
import { fetchSourceResult } from '../http'

const URL_LIST = 'https://www.jma.go.jp/bosai/information/data/r8/information.json'

export const listSchema = z.array(
  z.object({
    controlTitle: z.string(),
    headTitle: z.string(),
    publishingOffice: z.string(),
    reportDatetime: z.string(),
    validDatetime: z.string().nullable().optional(),
    eventId: z.string(),
    infoType: z.string(),
    areaType: z.string(),
    areaCode: z.string(),
    jsonName: z.string(),
  }),
)

/** Phenomenon keywords → urgency rank (AERIS ordering of JMA's own wording). */
const PHENOMENA: Array<[RegExp, string, number]> = [
  [/線状降水帯|顕著な大雨/, '線状降水帯', 3],
  [/台風第[０-９0-9]+号|台風/, '台風', 2],
  [/大雨/, '大雨', 2],
  [/暴風/, '暴風', 2],
  [/大雪/, '大雪', 2],
  [/高潮/, '高潮', 2],
  [/竜巻/, '竜巻', 1],
  [/落雷|雷/, '落雷', 1],
  [/突風/, '突風', 1],
  [/降ひょう|ひょう/, '降ひょう', 1],
  [/波浪|高波/, '高波', 1],
  [/高温/, '高温', 1],
  [/低温/, '低温', 1],
  [/少雨/, '少雨', 1],
]

export function classifyTitle(title: string): { phenomena: string[]; rank: number } {
  const hits = PHENOMENA.filter(([re]) => re.test(title))
  return {
    phenomena: [...new Set(hits.map(([, name]) => name))],
    rank: Math.max(0, ...hits.map(([, , r]) => r)),
  }
}

export function adaptInformation(
  list: z.infer<typeof listSchema>,
  retrievedAt: Instant,
): HazardAssessment[] {
  // One bulletin series per event id; the newest report wins.
  const newest = new Map<string, z.infer<typeof listSchema>[number]>()
  for (const x of list) {
    const prev = newest.get(x.eventId)
    if (!prev || epoch(x.reportDatetime) > epoch(prev.reportDatetime)) newest.set(x.eventId, x)
  }
  return [...newest.values()].map((x) => {
    const { phenomena, rank } = classifyTitle(x.headTitle)
    return {
      id: `jma-information:${x.jsonName}`,
      scheme: 'jma-information' as const,
      level: { value: phenomena.join('・') || x.controlTitle, label: x.headTitle },
      rank,
      area: { code: x.areaCode, name: x.publishingOffice },
      time: {
        issuedAt: x.reportDatetime,
        validFrom: x.reportDatetime,
        validUntil: x.validDatetime ?? undefined,
      },
      status: x.infoType === '取消' ? ('cancelled' as const) : ('issued' as const),
      sourceRole: 'warning' as const,
      values: { areaType: x.areaType, kind: x.controlTitle },
      provenance: {
        source: 'jma-information' as const,
        kind: 'official' as const,
        label: `気象庁 ${x.controlTitle}`,
        issuedAt: x.reportDatetime,
        retrievedAt,
        sourceRole: 'warning' as const,
      },
    }
  })
}

export async function fetchInformation(
  signal?: AbortSignal,
): Promise<SourceResult<HazardAssessment[]>> {
  return fetchSourceResult(
    'jma-information',
    URL_LIST,
    listSchema,
    (raw, retrievedAt) => ({
      data: adaptInformation(raw, retrievedAt),
      provenance: {
        source: 'jma-information',
        kind: 'official',
        label: '気象庁 気象情報',
        retrievedAt,
        sourceRole: 'warning',
      },
    }),
    { signal },
  )
}
