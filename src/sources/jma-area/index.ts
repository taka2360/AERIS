/**
 * JMA area hierarchy (area.json): class20 (municipality) → class15 → class10
 * (forecast area) → office. Municipality code + '00' = class20 code.
 */
import { z } from 'zod'
import { fetchValidated, memoized, type Fetched } from '../http'

const node = z.object({ name: z.string(), parent: z.string().optional() })
export const areaSchema = z.object({
  offices: z.record(z.string(), node),
  class10s: z.record(z.string(), node),
  class15s: z.record(z.string(), node),
  class20s: z.record(z.string(), node),
})
export type AreaTable = z.infer<typeof areaSchema>

export const AREA_URL = 'https://www.jma.go.jp/bosai/common/const/area.json'

export const loadAreaTable = memoized(24 * 60 * 60_000, (signal) =>
  fetchValidated(AREA_URL, areaSchema, { signal, timeoutMs: 20_000 }),
)

export type JmaArea = {
  office: string
  officeName: string
  class10: string
  class10Name: string
  class20: string
  class20Name: string
}

/**
 * Candidate class20 codes for a municipality. Designated cities (政令市) are a
 * single class20 entry while GSI returns the ward code, e.g. 札幌市中央区 01101 →
 * 札幌市 01100, 大阪市北区 27127 → 大阪市 27100. Exact match always wins.
 */
export function class20Candidates(muniCode: string): string[] {
  const n = Number(muniCode)
  const codes = [muniCode, String(n - (n % 10)), String(n - (n % 100))]
  return [...new Set(codes.map((c) => `${c.padStart(5, '0')}00`))]
}

export function resolveArea(table: AreaTable, muniCode: string): JmaArea | null {
  const class20 = class20Candidates(muniCode).find((c) => table.class20s[c]?.parent)
  if (!class20) return null
  const c20 = table.class20s[class20]!
  const c15 = table.class15s[c20.parent!]
  const class10 = c15?.parent ?? c20.parent!
  const c10 = table.class10s[class10]
  if (!c10?.parent) return null
  const office = table.offices[c10.parent]
  if (!office) return null
  return {
    office: c10.parent,
    officeName: office.name,
    class10,
    class10Name: c10.name,
    class20,
    class20Name: c20.name,
  }
}

export async function lookupArea(
  muniCode: string,
  signal?: AbortSignal,
): Promise<Fetched<JmaArea | null>> {
  const t = await loadAreaTable(signal)
  if (!t.ok) return t
  return { ok: true, data: resolveArea(t.data, muniCode) }
}
