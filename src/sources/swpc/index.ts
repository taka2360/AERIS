/**
 * NOAA SWPC space weather. Small summary products only (the 1-minute RTSW
 * files are megabytes):
 *   solar wind speed / IMF (L1 observation, propagated 1-h series)
 *   planetary Kp (3-hourly observed series; 1-minute estimate = EST)
 *   GOES X-ray flare status (observation)
 *   NOAA G / S / R scales (assessment, current + predicted)
 *   alerts / warnings / watches (statements)
 *   OVATION aurora probability (forecast model, on demand)
 */
import { z } from 'zod'
import type { AuroraGrid, SpaceWeather, SwpcAlert } from '@/domain/earth/reports'
import { normalizeLon } from '@/domain/earth/common'
import type { SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import { fetchValidated } from '../http'

const B = 'https://services.swpc.noaa.gov'

/** SWPC times without a zone are UTC. */
export const utc = (t: string): Instant =>
  toInstant(Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t.replace(' ', 'T')}Z`))

const speedSchema = z.array(z.object({ proton_speed: z.number().nullable(), time_tag: z.string() }))
const magSchema = z.array(
  z.object({ bt: z.number().nullable(), bz_gsm: z.number().nullable(), time_tag: z.string() }),
)
const propagatedSchema = z.array(z.array(z.union([z.string(), z.number(), z.null()])))
const kpSchema = z.array(z.object({ time_tag: z.string(), Kp: z.number() }))
const kp1mSchema = z.array(
  z.object({
    time_tag: z.string(),
    estimated_kp: z.number().nullable(),
    kp: z.string().optional(),
  }),
)
const flareSchema = z.array(
  z.object({
    time_tag: z.string(),
    current_class: z.string().nullable(),
    max_class: z.string().nullable().optional(),
    max_time: z.string().nullable().optional(),
  }),
)
const scaleEntry = z.object({
  DateStamp: z.string(),
  TimeStamp: z.string(),
  R: z.object({
    Scale: z.string().nullable(),
    MinorProb: z.string().nullable().optional(),
    MajorProb: z.string().nullable().optional(),
  }),
  S: z.object({ Scale: z.string().nullable(), Prob: z.string().nullable().optional() }),
  G: z.object({ Scale: z.string().nullable(), Text: z.string().nullable().optional() }),
})
const scalesSchema = z.record(z.string(), scaleEntry)
const alertsSchema = z.array(
  z.object({ product_id: z.string(), issue_datetime: z.string(), message: z.string() }),
)

const n = (v: string | null | undefined) => (v == null || v === '' ? null : Number(v))

export function parseAlert(a: z.infer<typeof alertsSchema>[number]): SwpcAlert {
  const lines = a.message.split(/\r?\n/).map((l) => l.trim())
  const head =
    lines.find((l) => /^(ALERT|WARNING|WATCH|SUMMARY|EXTENDED WARNING|CANCEL)/.test(l)) ??
    lines[0] ??
    ''
  const [kind, ...rest] = head.split(':')
  const scale = /NOAA Scale:\s*([GSR]\d)/i.exec(a.message)?.[1]?.toUpperCase()
  return {
    id: `${a.product_id}:${a.issue_datetime}`,
    productId: a.product_id,
    issuedAt: utc(a.issue_datetime),
    kind: (kind ?? '').trim(),
    title: rest.join(':').trim() || head,
    scale,
  }
}

export function adaptSpaceWeather(parts: {
  speed?: z.infer<typeof speedSchema>
  mag?: z.infer<typeof magSchema>
  propagated?: z.infer<typeof propagatedSchema>
  kp?: z.infer<typeof kpSchema>
  kp1m?: z.infer<typeof kp1mSchema>
  flares?: z.infer<typeof flareSchema>
  scales?: z.infer<typeof scalesSchema>
  alerts?: z.infer<typeof alertsSchema>
}): SpaceWeather {
  const sp = parts.speed?.at(-1)
  const mg = parts.mag?.at(-1)
  const [header, ...rows] = parts.propagated ?? []
  const col = (name: string) => (header ?? []).indexOf(name)
  const iT = col('time_tag')
  const iS = col('speed')
  const iBz = col('bz')
  const k1 = parts.kp1m?.at(-1)
  const fl = parts.flares?.at(-1)
  const sc = parts.scales ?? {}
  const cur = sc['0']
  return {
    solarWind: {
      speed: sp?.proton_speed ?? null,
      bt: mg?.bt ?? null,
      bz: mg?.bz_gsm ?? null,
      at: sp ? utc(sp.time_tag) : mg ? utc(mg.time_tag) : null,
    },
    windSeries: rows
      .filter((r) => typeof r[iT] === 'string')
      .map((r) => ({
        t: utc(r[iT] as string),
        speed: typeof r[iS] === 'number' ? (r[iS] as number) : null,
        bz: typeof r[iBz] === 'number' ? (r[iBz] as number) : null,
      })),
    kp: {
      estimated: k1?.estimated_kp ?? null,
      estimatedAt: k1 ? utc(k1.time_tag) : null,
      series: (parts.kp ?? []).map((k) => ({ t: utc(k.time_tag), kp: k.Kp })),
    },
    xray: {
      current: fl?.current_class ?? null,
      at: fl ? utc(fl.time_tag) : null,
      maxClass: fl?.max_class ?? null,
      maxAt: fl?.max_time ? utc(fl.max_time) : null,
    },
    scales: {
      current: { G: n(cur?.G.Scale) ?? 0, S: n(cur?.S.Scale) ?? 0, R: n(cur?.R.Scale) ?? 0 },
      predicted: ['1', '2', '3']
        .map((k) => sc[k])
        .filter((e): e is NonNullable<typeof e> => !!e)
        .map((e) => ({
          date: e.DateStamp,
          G: n(e.G.Scale),
          rMinorProb: n(e.R.MinorProb),
          sProb: n(e.S.Prob),
        })),
      at: cur ? utc(`${cur.DateStamp}T${cur.TimeStamp}`) : null,
    },
    // Newest statement per product.
    alerts: [
      ...new Map((parts.alerts ?? []).map(parseAlert).map((a) => [a.productId, a])).values(),
    ],
  }
}

const opts = { timeoutMs: 15_000 }

export async function fetchSpaceWeather(signal?: AbortSignal): Promise<SourceResult<SpaceWeather>> {
  const get = <S extends z.ZodType>(path: string, schema: S) =>
    fetchValidated(`${B}/${path}`, schema, { ...opts, signal })
  const [speed, mag, propagated, kp, kp1m, flares, scales, alerts] = await Promise.all([
    get('products/summary/solar-wind-speed.json', speedSchema),
    get('products/summary/solar-wind-mag-field.json', magSchema),
    get('products/geospace/propagated-solar-wind-1-hour.json', propagatedSchema),
    get('products/noaa-planetary-k-index.json', kpSchema),
    get('json/planetary_k_index_1m.json', kp1mSchema),
    get('json/goes/primary/xray-flares-latest.json', flareSchema),
    get('products/noaa-scales.json', scalesSchema),
    get('products/alerts.json', alertsSchema),
  ])
  const all = [speed, mag, propagated, kp, kp1m, flares, scales, alerts]
  const failed = all.flatMap((r) => (r.ok ? [] : [r.error]))
  if (failed.length === all.length) return { ok: false, source: 'swpc', error: failed[0]! }
  const ok = <T>(r: { ok: true; data: T } | { ok: false }) => (r.ok ? r.data : undefined)
  const data = adaptSpaceWeather({
    speed: ok(speed),
    mag: ok(mag),
    propagated: ok(propagated),
    kp: ok(kp),
    kp1m: ok(kp1m),
    flares: ok(flares),
    scales: ok(scales),
    alerts: ok(alerts),
  })
  return {
    ok: true,
    data,
    provenance: {
      source: 'swpc',
      kind: 'observation',
      label: 'NOAA SWPC',
      observedAt: data.solarWind.at ?? undefined,
      retrievedAt: toInstant(Date.now()),
      role: 'observed',
      derivation: 'measured',
      sourceRole: 'observation',
      // Some products failed: the picture is incomplete.
      decode: failed.length > 0 ? 'partial' : 'decoded',
    },
  }
}

// ── OVATION aurora (forecast model) ─────────────────────────────────────────

const ovationSchema = z.object({
  'Observation Time': z.string(),
  'Forecast Time': z.string(),
  coordinates: z.array(z.tuple([z.number(), z.number(), z.number()])),
})

export const ovationSchemaParse = (raw: unknown) => ovationSchema.parse(raw)

export function adaptOvation(raw: z.infer<typeof ovationSchema>, minProb = 5): AuroraGrid {
  return {
    observedAt: utc(raw['Observation Time']),
    forecastFor: utc(raw['Forecast Time']),
    cells: raw.coordinates
      .filter(([, , p]) => p >= minProb)
      .map(([lon, lat, p]) => [normalizeLon(lon), lat, p] as [number, number, number]),
  }
}

export async function fetchAurora(signal?: AbortSignal): Promise<SourceResult<AuroraGrid>> {
  const r = await fetchValidated(`${B}/json/ovation_aurora_latest.json`, ovationSchema, {
    signal,
    timeoutMs: 20_000,
  })
  if (!r.ok) return { ok: false, source: 'swpc', error: r.error }
  const data = adaptOvation(r.data)
  return {
    ok: true,
    data,
    provenance: {
      source: 'swpc',
      kind: 'forecast',
      label: 'NOAA SWPC OVATION',
      issuedAt: data.observedAt,
      validFrom: data.forecastFor,
      retrievedAt: toInstant(Date.now()),
      role: 'forecast',
      derivation: 'modeled',
      sourceRole: 'forecast',
    },
  }
}
