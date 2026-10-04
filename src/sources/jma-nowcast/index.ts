/**
 * JMA high-resolution precipitation nowcast (hrpns). Frame lists for observed
 * (N1) and forecast (N2) times → tile URL templates. URL structure stays here.
 */
import { z } from 'zod'
import type { NowcastFrame } from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import { epoch, toInstant, type Instant } from '@/domain/time'
import { fetchValidated } from '../http'

const BASE = 'https://www.jma.go.jp/bosai/jmatile/data/nowc'

export const targetTimesSchema = z.array(
  z.object({ basetime: z.string(), validtime: z.string(), elements: z.array(z.string()) }),
)

/** 'YYYYMMDDHHmmss' (UTC) → Instant (JST). */
export function utcStampToInstant(stamp: string): Instant {
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}Z`
  return toInstant(Date.parse(iso))
}

export function tileTemplate(basetime: string, validtime: string): string {
  return `${BASE}/${basetime}/none/${validtime}/surf/hrpns/{z}/{x}/{y}.png`
}

export function adaptFrames(
  observed: z.infer<typeof targetTimesSchema>,
  forecast: z.infer<typeof targetTimesSchema>,
  pastFrames = 12,
): NowcastFrame[] {
  const obs = observed
    .filter((t) => t.elements.includes('hrpns'))
    .slice(0, pastFrames)
    .map<NowcastFrame>((t) => ({
      validTime: utcStampToInstant(t.validtime),
      kind: 'observation',
      tileUrlTemplate: tileTemplate(t.basetime, t.validtime),
    }))
  const fc = forecast
    .filter((t) => t.elements.includes('hrpns'))
    .map<NowcastFrame>((t) => ({
      validTime: utcStampToInstant(t.validtime),
      kind: 'forecast',
      tileUrlTemplate: tileTemplate(t.basetime, t.validtime),
    }))
  return [...obs, ...fc].sort((a, b) => epoch(a.validTime) - epoch(b.validTime))
}

export async function fetchNowcastFrames(
  signal?: AbortSignal,
): Promise<SourceResult<NowcastFrame[]>> {
  const [n1, n2] = await Promise.all([
    fetchValidated(`${BASE}/targetTimes_N1.json`, targetTimesSchema, { signal }),
    fetchValidated(`${BASE}/targetTimes_N2.json`, targetTimesSchema, { signal }),
  ])
  if (!n1.ok) return { ok: false, source: 'jma-nowcast', error: n1.error }
  const frames = adaptFrames(n1.data, n2.ok ? n2.data : [])
  const latest = frames.filter((f) => f.kind === 'observation').at(-1)?.validTime
  return {
    ok: true,
    data: frames,
    provenance: {
      source: 'jma-nowcast',
      kind: 'observation',
      label: 'JMA NOWCAST',
      observedAt: latest,
      retrievedAt: toInstant(Date.now()),
    },
  }
}
