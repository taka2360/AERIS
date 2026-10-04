/**
 * GSI (国土地理院) services:
 *  - reverse geocoder: coordinates → municipality code
 *  - address search: Japanese place name → coordinates
 */
import { z } from 'zod'
import type { PlaceCandidate } from '@/domain/model'
import { fetchValidated, type Fetched } from '../http'

const reverseSchema = z.object({
  results: z.object({ muniCd: z.string(), lv01Nm: z.string() }).optional(),
})

export type ReverseResult = { muniCode: string; localName: string } | null

export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<Fetched<ReverseResult>> {
  const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat.toFixed(
    4,
  )}&lon=${lon.toFixed(4)}`
  const r = await fetchValidated(url, reverseSchema, { signal })
  if (!r.ok) return r
  const res = r.data.results
  // Offshore points return {} — not an error, just no municipality.
  if (!res?.muniCd) return { ok: true, data: null }
  // muniCd is sometimes zero-padded inconsistently; normalise to 5 digits.
  return { ok: true, data: { muniCode: res.muniCd.padStart(5, '0'), localName: res.lv01Nm } }
}

const searchSchema = z.array(
  z.object({
    geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
    properties: z.object({ title: z.string(), addressCode: z.string().optional() }),
  }),
)

export async function searchAddress(
  query: string,
  signal?: AbortSignal,
  limit = 8,
): Promise<Fetched<PlaceCandidate[]>> {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`
  const r = await fetchValidated(url, searchSchema, { signal })
  if (!r.ok) return r
  // Prefer titles that start with the query (municipalities), keep GSI order otherwise.
  const scored = r.data.map((f, i) => ({
    f,
    score: (f.properties.title.includes(query) ? 0 : 1) * 1000 + i,
  }))
  scored.sort((a, b) => a.score - b.score)
  return {
    ok: true,
    data: scored.slice(0, limit).map(({ f }) => ({
      name: f.properties.title,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
    })),
  }
}

/** JIS X 0401 prefecture codes (first two digits of a municipality code). */
export const PREFECTURES = [
  '',
  '北海道',
  '青森県',
  '岩手県',
  '宮城県',
  '秋田県',
  '山形県',
  '福島県',
  '茨城県',
  '栃木県',
  '群馬県',
  '埼玉県',
  '千葉県',
  '東京都',
  '神奈川県',
  '新潟県',
  '富山県',
  '石川県',
  '福井県',
  '山梨県',
  '長野県',
  '岐阜県',
  '静岡県',
  '愛知県',
  '三重県',
  '滋賀県',
  '京都府',
  '大阪府',
  '兵庫県',
  '奈良県',
  '和歌山県',
  '鳥取県',
  '島根県',
  '岡山県',
  '広島県',
  '山口県',
  '徳島県',
  '香川県',
  '愛媛県',
  '高知県',
  '福岡県',
  '佐賀県',
  '長崎県',
  '熊本県',
  '大分県',
  '宮崎県',
  '鹿児島県',
  '沖縄県',
] as const

export function prefectureOf(muniCode: string): string {
  return PREFECTURES[Number(muniCode.slice(0, 2))] ?? ''
}
