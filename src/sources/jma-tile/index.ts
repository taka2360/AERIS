/**
 * JMA bosai tile products (jmatile): time lists → RasterFieldSeries, point
 * sampling by palette decoding, and LIDEN lightning strokes (GeoJSON).
 * Tile URL structure is known only here.
 *
 *   nowc  N1 hrpns (observed) · N2 hrpns (nowcast) · N3 thns/trns (both) + liden
 *   risk  land / inund (キキクル, analysis + short forecast)
 *   snow  snowd / snowf03h (analysis + forecast)
 */
import { z } from 'zod'
import type { RasterFieldKind, RasterFieldSeries, RasterFrame } from '@/domain/earth/fields'
import type { Derivation, TemporalRole } from '@/domain/earth/common'
import { framesToIntervals } from '@/domain/earth/temporal'
import type { SourceId } from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { fetchValidated } from '../http'
import { utcStampToInstant } from '../jma-nowcast'

const BASE = 'https://www.jma.go.jp/bosai/jmatile/data'

export const targetTimesSchema = z.array(
  z.object({
    basetime: z.string(),
    validtime: z.string(),
    member: z.string().optional(),
    elements: z.array(z.string()),
  }),
)
export type TargetTime = z.infer<typeof targetTimesSchema>[number]

export type Product = 'nowc' | 'risk' | 'snow'

export function tileTemplate(product: Product, t: TargetTime, element: string): string {
  return `${BASE}/${product}/${t.basetime}/${t.member ?? 'none'}/${t.validtime}/surf/${element}/{z}/{x}/{y}.png`
}

export function geojsonUrl(product: Product, t: TargetTime, element: string): string {
  return `${BASE}/${product}/${t.basetime}/${t.member ?? 'none'}/${t.validtime}/surf/${element}/data.geojson`
}

type FieldSpec = {
  kind: RasterFieldKind
  product: Product
  element: string
  source: SourceId
  label: string
  /** Role of frames whose validtime equals their basetime */
  /** Time lists (relative to jmatile/data) that carry this element */
  lists: string[]
  presentRole: TemporalRole
  futureRole: TemporalRole
  derivation: Derivation
}

const N12 = ['nowc/targetTimes_N1.json', 'nowc/targetTimes_N2.json']
const N3 = ['nowc/targetTimes_N3.json']
const RISK = ['risk/targetTimes.json']
const SNOW = ['snow/targetTimes.json']

/** Fields served as PNG tiles. (洪水キキクル is a vector-tile product, handled separately.) */
export type TileFieldKind = Exclude<RasterFieldKind, 'kikikuru-flood'>

export const FIELD_SPECS: Record<TileFieldKind, FieldSpec> = {
  'precip-intensity': {
    kind: 'precip-intensity',
    product: 'nowc',
    element: 'hrpns',
    source: 'jma-nowcast',
    label: 'JMA 高解像度降水ナウキャスト',
    lists: N12,
    presentRole: 'observed',
    futureRole: 'nowcast',
    derivation: 'measured',
  },
  'lightning-activity': {
    kind: 'lightning-activity',
    product: 'nowc',
    element: 'thns',
    source: 'jma-thunder',
    label: 'JMA 雷ナウキャスト',
    lists: N3,
    presentRole: 'analysis',
    futureRole: 'nowcast',
    derivation: 'derived',
  },
  'tornado-probability': {
    kind: 'tornado-probability',
    product: 'nowc',
    element: 'trns',
    source: 'jma-thunder',
    label: 'JMA 竜巻発生確度ナウキャスト',
    lists: N3,
    presentRole: 'analysis',
    futureRole: 'nowcast',
    derivation: 'derived',
  },
  'kikikuru-land': {
    kind: 'kikikuru-land',
    product: 'risk',
    element: 'land',
    source: 'jma-risk',
    label: 'JMA 土砂キキクル',
    lists: RISK,
    presentRole: 'analysis',
    futureRole: 'forecast',
    derivation: 'derived',
  },
  'kikikuru-inundation': {
    kind: 'kikikuru-inundation',
    product: 'risk',
    element: 'inund',
    source: 'jma-risk',
    label: 'JMA 浸水キキクル',
    lists: RISK,
    presentRole: 'analysis',
    futureRole: 'forecast',
    derivation: 'derived',
  },
  'snow-depth': {
    kind: 'snow-depth',
    product: 'snow',
    element: 'snowd',
    source: 'jma-snow',
    label: 'JMA 解析積雪深',
    lists: SNOW,
    presentRole: 'analysis',
    futureRole: 'forecast',
    derivation: 'estimated',
  },
  'snowfall-3h': {
    kind: 'snowfall-3h',
    product: 'snow',
    element: 'snowf03h',
    source: 'jma-snow',
    label: 'JMA 解析降雪量(3時間)',
    lists: SNOW,
    presentRole: 'analysis',
    futureRole: 'forecast',
    derivation: 'estimated',
  },
}

/**
 * Build a series for one field from a product's time list(s). Entries that
 * do not carry the element are ignored; duplicate valid times keep the
 * newest basetime (the freshest analysis for that time).
 */
export function buildSeries(
  spec: FieldSpec,
  entries: TargetTime[],
  retrievedAt: Instant,
): RasterFieldSeries {
  const byValid = new Map<string, TargetTime>()
  for (const t of entries) {
    if (!t.elements.includes(spec.element)) continue
    // キキクル publishes several members; immed0 is the latest analysis.
    if (t.member && t.member !== 'none' && !t.member.startsWith('immed')) continue
    const prev = byValid.get(t.validtime)
    if (!prev || t.basetime > prev.basetime) byValid.set(t.validtime, t)
  }
  const frames = framesToIntervals(
    [...byValid.values()].map((t) => ({
      validTime: utcStampToInstant(t.validtime),
      issuedAt: utcStampToInstant(t.basetime),
      role: t.validtime === t.basetime ? spec.presentRole : spec.futureRole,
      tileUrlTemplate: tileTemplate(spec.product, t, spec.element),
    })),
  ).map<RasterFrame>((f) => ({
    validFrom: f.validFrom,
    validUntil: f.validUntil,
    issuedAt: f.issuedAt,
    role: f.role,
    tileUrlTemplate: f.tileUrlTemplate,
  }))
  const latest = frames.filter((f) => f.role === spec.presentRole).at(-1)
  return {
    kind: spec.kind,
    frames,
    derivation: spec.derivation,
    provenance: {
      source: spec.source,
      kind: spec.presentRole === 'observed' ? 'observation' : 'official',
      label: spec.label,
      observedAt: latest?.issuedAt,
      retrievedAt,
      role: spec.presentRole,
      sourceRole: spec.product === 'risk' ? 'assessment' : 'observation',
    },
  }
}

export async function fetchTargetTimes(
  lists: string[],
  source: SourceId,
  signal?: AbortSignal,
): Promise<SourceResult<TargetTime[]>> {
  const results = await Promise.all(
    lists.map((p) => fetchValidated(`${BASE}/${p}`, targetTimesSchema, { signal })),
  )
  const firstFailure = results.find((l) => !l.ok)
  if (firstFailure && !firstFailure.ok && results.every((l) => !l.ok))
    return { ok: false, source, error: firstFailure.error }
  return {
    ok: true,
    data: results.flatMap((l) => (l.ok ? l.data : [])),
    provenance: {
      source,
      kind: 'official',
      retrievedAt: toInstant(Date.now()),
      // e.g. forecast list missing: only observed frames are available.
      decode: firstFailure ? 'partial' : 'decoded',
    },
  }
}

export async function fetchFieldSeries(
  kind: TileFieldKind,
  signal?: AbortSignal,
): Promise<SourceResult<RasterFieldSeries>> {
  const spec = FIELD_SPECS[kind]
  const r = await fetchTargetTimes(spec.lists, spec.source, signal)
  if (!r.ok) return r
  const series = buildSeries(spec, r.data, r.provenance.retrievedAt)
  if (r.provenance.decode === 'partial') series.provenance.decode = 'partial'
  return { ok: true, data: series, provenance: series.provenance }
}

// ── LIDEN lightning strokes ─────────────────────────────────────────────────

export const lidenSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      geometry: z.object({
        type: z.literal('Point'),
        coordinates: z.tuple([z.number(), z.number()]).rest(z.number()),
      }),
      properties: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
})

/** One detected lightning discharge (LIDEN), within a 5-minute window. */
export type LightningStroke = {
  lat: number
  lon: number
  /** Cloud-to-ground (落雷) vs cloud discharge (雲放電) */
  kind: 'cg' | 'cc'
  windowStart: Instant
  windowEnd: Instant
}

/** LIDEN frame → strokes. type 4 = cloud-to-ground (per JMA's own renderer). */
export function adaptLiden(
  fc: z.infer<typeof lidenSchema>,
  validTime: Instant,
  windowMin = 5,
): LightningStroke[] {
  const end = validTime
  const start = toInstant(Date.parse(validTime) - windowMin * 60_000)
  return fc.features.map((f) => ({
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    kind: Number(f.properties?.type) === 4 ? 'cg' : 'cc',
    windowStart: start,
    windowEnd: end,
  }))
}

/** Observed LIDEN frames from the N3 list, newest first. */
export function lidenFrames(entries: TargetTime[], limit = 12): TargetTime[] {
  return entries
    .filter((t) => t.elements.includes('liden') && t.basetime === t.validtime)
    .sort((a, b) => (a.validtime < b.validtime ? 1 : -1))
    .slice(0, limit)
}

export async function fetchLightningStrokes(
  signal?: AbortSignal,
  frames = 12,
): Promise<SourceResult<{ strokes: LightningStroke[]; frames: Instant[] }>> {
  const list = await fetchValidated(`${BASE}/nowc/targetTimes_N3.json`, targetTimesSchema, {
    signal,
  })
  if (!list.ok) return { ok: false, source: 'jma-thunder', error: list.error }
  const picked = lidenFrames(list.data, frames)
  const results = await Promise.all(
    picked.map((t) => fetchValidated(geojsonUrl('nowc', t, 'liden'), lidenSchema, { signal })),
  )
  const strokes: LightningStroke[] = []
  const ok: Instant[] = []
  results.forEach((r, i) => {
    if (!r.ok) return
    const vt = utcStampToInstant(picked[i]!.validtime)
    ok.push(vt)
    strokes.push(...adaptLiden(r.data, vt))
  })
  if (picked.length > 0 && ok.length === 0) {
    const first = results.find((r) => !r.ok)
    if (first && !first.ok) return { ok: false, source: 'jma-thunder', error: first.error }
  }
  const latest = ok[0]
  return {
    ok: true,
    data: { strokes, frames: ok },
    provenance: {
      source: 'jma-thunder',
      kind: 'observation',
      label: 'JMA LIDEN',
      observedAt: latest,
      retrievedAt: toInstant(Date.now()),
      role: 'observed',
      derivation: 'measured',
      sourceRole: 'observation',
      // Some 5-minute files failed: the set of strokes is incomplete.
      decode: ok.length < picked.length ? 'partial' : 'decoded',
    },
  }
}
