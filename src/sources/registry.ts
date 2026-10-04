/**
 * Source registry — the contract AERIS holds with every data source:
 * licence, attribution, redistribution terms, access constraints, the role
 * of its data, how fresh it must be and how often to poll it.
 *
 * Health, polling, attribution and docs/DATA_SOURCES.md all read from here.
 * This file must stay free of runtime imports (scripts/gen-data-sources.ts
 * loads it directly with Node).
 */
import type { DataQuality, Derivation, SourceRole, TemporalRole } from '../domain/earth/common'
import type { SourceId } from '../domain/model'

export type SourceDomain =
  | 'weather'
  | 'seismic'
  | 'tsunami'
  | 'volcano'
  | 'atmosphere'
  | 'hydro'
  | 'ocean'
  | 'environment'
  | 'space'
  | 'global'
  | 'map'
  | 'geocode'
  | 'internal'

/** Declarative condition for switching to the active polling rate. */
export type ActiveWhen =
  | { signal: 'tsunami-assessment'; minRank: number }
  | { signal: 'recent-earthquake'; minIntensityRank: number; withinMin: number }
  | { signal: 'cyclone-active' }
  | { signal: 'geomagnetic'; minKp: number }

export type SourceSpec = {
  id: SourceId
  label: string
  owner: string
  domain: SourceDomain
  status: 'active' | 'planned' | 'unavailable'
  endpoints: string[]
  license: string
  attribution: { text: string; url?: string }
  redistribution: string
  apiKey: 'none' | 'relay-secret'
  /** Reachable directly from the browser */
  cors: boolean
  rateLimit?: string
  sourceRole: SourceRole
  defaultRole: TemporalRole
  derivation: Derivation
  defaultQuality?: DataQuality
  freshness: { expectedIntervalMin: number; staleAfterMin: number }
  poll: { nominalMs: number; activeMs?: number; activeWhen?: ActiveWhen }
  notes?: string
}

const MIN = 60_000

const JMA_LICENSE = '気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠)'
const JMA_ATTR = { text: '出典：気象庁ホームページ', url: 'https://www.jma.go.jp/' }
const JMA_REDIST = '出典明記で複製・加工・再配布可。加工時は加工した旨を明記'
const JMA_BOSAI_NOTE = 'bosai JSON は正式 API ではなく、予告なく構造が変わる可能性がある'

const OM_LICENSE = 'CC BY 4.0(無料枠は非商用・1日1万回まで)'
const OM_ATTR = { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/' }

export const SOURCES: SourceSpec[] = [
  // ── Weather core (existing) ────────────────────────────────────────────────
  {
    id: 'openmeteo',
    label: 'FORECAST MODEL',
    owner: 'Open-Meteo',
    domain: 'weather',
    status: 'active',
    endpoints: ['https://api.open-meteo.com/v1/forecast'],
    license: OM_LICENSE,
    attribution: OM_ATTR,
    redistribution: '出典明記で可',
    apiKey: 'none',
    cors: true,
    rateLimit: '10,000 calls/day(非商用)',
    sourceRole: 'forecast',
    defaultRole: 'forecast',
    derivation: 'modeled',
    freshness: { expectedIntervalMin: 60, staleAfterMin: 180 },
    poll: { nominalMs: 10 * MIN },
  },
  {
    id: 'jma-amedas',
    label: 'AMeDAS OBS',
    owner: '気象庁',
    domain: 'weather',
    status: 'active',
    endpoints: ['https://www.jma.go.jp/bosai/amedas/data/'],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'observation',
    defaultRole: 'observed',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 10, staleAfterMin: 40 },
    poll: { nominalMs: 5 * MIN },
    notes: JMA_BOSAI_NOTE,
  },
  {
    id: 'jma-warning',
    label: 'JMA WARNING',
    owner: '気象庁',
    domain: 'weather',
    status: 'active',
    endpoints: ['https://www.jma.go.jp/bosai/warning/data/r8/'],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'warning',
    defaultRole: 'forecast',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 10, staleAfterMin: 30 },
    poll: { nominalMs: 3 * MIN },
    notes: JMA_BOSAI_NOTE,
  },
  {
    id: 'jma-forecast',
    label: 'JMA FORECAST',
    owner: '気象庁',
    domain: 'weather',
    status: 'active',
    endpoints: ['https://www.jma.go.jp/bosai/forecast/data/forecast/'],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'forecast',
    defaultRole: 'forecast',
    derivation: 'modeled',
    freshness: { expectedIntervalMin: 360, staleAfterMin: 24 * 60 },
    poll: { nominalMs: 30 * MIN },
    notes: JMA_BOSAI_NOTE,
  },
  {
    id: 'jma-nowcast',
    label: 'RADAR NOWCAST',
    owner: '気象庁',
    domain: 'weather',
    status: 'active',
    endpoints: ['https://www.jma.go.jp/bosai/jmatile/data/nowc/'],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'observation',
    defaultRole: 'nowcast',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 5, staleAfterMin: 20 },
    poll: { nominalMs: 5 * MIN },
    notes: '観測フレームは観測、予測フレームはナウキャスト予測。タイルは AERIS 配色に再着色(加工)',
  },

  // ── Seismic / tsunami / volcano ────────────────────────────────────────────
  {
    id: 'jma-quake',
    label: 'JMA SEISMIC',
    owner: '気象庁',
    domain: 'seismic',
    status: 'active',
    endpoints: ['https://www.jma.go.jp/bosai/quake/data/list.json'],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'observation',
    defaultRole: 'observed',
    derivation: 'measured',
    defaultQuality: 'confirmed',
    freshness: { expectedIntervalMin: 60, staleAfterMin: 15 },
    poll: {
      nominalMs: 2 * MIN,
      activeMs: 30_000,
      activeWhen: { signal: 'recent-earthquake', minIntensityRank: 3, withinMin: 60 },
    },
    notes: `震度速報のみの段階は震源未確定(PRELIM)。鮮度は最終確認時刻で判定。${JMA_BOSAI_NOTE}`,
  },
  {
    id: 'usgs-quake',
    label: 'USGS SEISMIC',
    owner: 'U.S. Geological Survey',
    domain: 'seismic',
    status: 'active',
    endpoints: ['https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/'],
    license: 'Public domain (U.S. Government)',
    attribution: { text: 'USGS Earthquake Hazards Program', url: 'https://earthquake.usgs.gov/' },
    redistribution: '制限なし(出典表記推奨)',
    apiKey: 'none',
    cors: true,
    sourceRole: 'observation',
    defaultRole: 'observed',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 5, staleAfterMin: 30 },
    poll: { nominalMs: 2 * MIN },
    notes: 'status=automatic は PRELIM、reviewed は CONFIRMED として扱う',
  },
  {
    id: 'jma-tsunami',
    label: 'JMA TSUNAMI',
    owner: '気象庁',
    domain: 'tsunami',
    status: 'active',
    endpoints: [
      'https://www.jma.go.jp/bosai/tsunami/data/list.json',
      'https://www.jma.go.jp/bosai/common/const/geojson/tsunami.json',
    ],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'warning',
    defaultRole: 'forecast',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 60, staleAfterMin: 10 },
    poll: {
      nominalMs: 2 * MIN,
      activeMs: 30_000,
      activeWhen: { signal: 'tsunami-assessment', minRank: 2 },
    },
    notes: `鮮度はデータ時刻ではなく最終確認時刻で判定(平時は発表がない)。${JMA_BOSAI_NOTE}`,
  },
  {
    id: 'jma-volcano',
    label: 'JMA VOLCANO',
    owner: '気象庁',
    domain: 'volcano',
    status: 'active',
    endpoints: [
      'https://www.jma.go.jp/bosai/volcano/const/volcano_list.json',
      'https://www.jma.go.jp/bosai/volcano/data/warning.json',
    ],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'warning',
    defaultRole: 'forecast',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 60, staleAfterMin: 30 },
    poll: { nominalMs: 10 * MIN },
    notes: `warning.json に載る火山(警報中または最近変更)のみ発表内容を表示。載らない火山のレベルは推定しない。eruption.json(噴火の観測)は構造未確認のため未対応。鮮度は最終確認時刻で判定。${JMA_BOSAI_NOTE}`,
  },

  // ── Atmosphere ─────────────────────────────────────────────────────────────
  {
    id: 'jma-thunder',
    label: 'LIGHTNING / TORNADO',
    owner: '気象庁',
    domain: 'atmosphere',
    status: 'planned',
    endpoints: ['https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N3.json'],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'observation',
    defaultRole: 'nowcast',
    derivation: 'derived',
    freshness: { expectedIntervalMin: 10, staleAfterMin: 25 },
    poll: { nominalMs: 5 * MIN },
    notes: '雷活動度(1km 格子・4段階)は雷監視システムからの解析値。個別落雷位置ではない',
  },
  {
    id: 'jma-information',
    label: 'JMA INFORMATION',
    owner: '気象庁',
    domain: 'atmosphere',
    status: 'active',
    endpoints: ['https://www.jma.go.jp/bosai/information/data/r8/information.json'],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'warning',
    defaultRole: 'forecast',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 60, staleAfterMin: 30 },
    poll: { nominalMs: 5 * MIN },
    notes: `気象解説情報・顕著な大雨に関する情報など。見出しの現象名で分類(分類はAERIS)。鮮度は最終確認時刻で判定。${JMA_BOSAI_NOTE}`,
  },
  {
    id: 'jma-typhoon',
    label: 'JMA TYPHOON',
    owner: '気象庁',
    domain: 'atmosphere',
    status: 'active',
    endpoints: ['https://www.jma.go.jp/bosai/typhoon/data/'],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'forecast',
    defaultRole: 'analysis',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 180, staleAfterMin: 6 * 60 },
    poll: { nominalMs: 10 * MIN, activeMs: 5 * MIN, activeWhen: { signal: 'cyclone-active' } },
    notes: JMA_BOSAI_NOTE,
  },

  // ── Hydro / ground / snow ──────────────────────────────────────────────────
  {
    id: 'jma-risk',
    label: 'KIKIKURU',
    owner: '気象庁',
    domain: 'hydro',
    status: 'planned',
    endpoints: ['https://www.jma.go.jp/bosai/jmatile/data/risk/targetTimes.json'],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'assessment',
    defaultRole: 'nowcast',
    derivation: 'derived',
    freshness: { expectedIntervalMin: 10, staleAfterMin: 30 },
    poll: { nominalMs: 10 * MIN },
    notes: 'キキクルは危険度の評価(ASSESSMENT)であり、水位・土壌水分の観測値ではない',
  },
  {
    id: 'jma-snow',
    label: 'SNOW ANALYSIS',
    owner: '気象庁',
    domain: 'environment',
    status: 'planned',
    endpoints: ['https://www.jma.go.jp/bosai/jmatile/data/snow/targetTimes.json'],
    license: JMA_LICENSE,
    attribution: JMA_ATTR,
    redistribution: JMA_REDIST,
    apiKey: 'none',
    cors: true,
    sourceRole: 'observation',
    defaultRole: 'analysis',
    derivation: 'estimated',
    freshness: { expectedIntervalMin: 60, staleAfterMin: 180 },
    poll: { nominalMs: 30 * MIN },
    notes: '解析積雪深は観測とモデルから推定した面的な値(EST)',
  },
  {
    id: 'openmeteo-flood',
    label: 'RIVER DISCHARGE',
    owner: 'Open-Meteo / Copernicus GloFAS',
    domain: 'hydro',
    status: 'planned',
    endpoints: ['https://flood-api.open-meteo.com/v1/flood'],
    license: `${OM_LICENSE}。GloFAS は Copernicus 利用条件`,
    attribution: {
      text: 'Open-Meteo.com / Copernicus Emergency Management Service (GloFAS)',
      url: 'https://open-meteo.com/en/docs/flood-api',
    },
    redistribution: '出典明記で可',
    apiKey: 'none',
    cors: true,
    sourceRole: 'forecast',
    defaultRole: 'forecast',
    derivation: 'modeled',
    freshness: { expectedIntervalMin: 24 * 60, staleAfterMin: 48 * 60 },
    poll: { nominalMs: 60 * MIN },
    notes: '5km 格子のモデル値。最寄りの河川が正しく選ばれない場合がある(観測値として表示しない)',
  },
  {
    id: 'relay-hydro',
    label: 'RIVER GAUGE',
    owner: '国土交通省 水文水質データベース',
    domain: 'hydro',
    status: 'planned',
    endpoints: ['(relay) /hydro'],
    license: '要確認(実装時に利用規約を確認し、再配信不可なら実装しない)',
    attribution: { text: '国土交通省 水文水質データベース', url: 'http://www1.river.go.jp/' },
    redistribution: '要確認',
    apiKey: 'none',
    cors: false,
    sourceRole: 'observation',
    defaultRole: 'observed',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 10, staleAfterMin: 60 },
    poll: { nominalMs: 10 * MIN },
  },

  // ── Ocean / environment ────────────────────────────────────────────────────
  {
    id: 'openmeteo-marine',
    label: 'MARINE MODEL',
    owner: 'Open-Meteo',
    domain: 'ocean',
    status: 'planned',
    endpoints: ['https://marine-api.open-meteo.com/v1/marine'],
    license: OM_LICENSE,
    attribution: OM_ATTR,
    redistribution: '出典明記で可',
    apiKey: 'none',
    cors: true,
    sourceRole: 'forecast',
    defaultRole: 'forecast',
    derivation: 'modeled',
    freshness: { expectedIntervalMin: 60, staleAfterMin: 6 * 60 },
    poll: { nominalMs: 60 * MIN },
    notes: '波浪・SST・海流はモデル値。沿岸域では精度が限られる',
  },
  {
    id: 'noaa-tides',
    label: 'TIDE GAUGE',
    owner: 'NOAA CO-OPS',
    domain: 'ocean',
    status: 'planned',
    endpoints: ['https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'],
    license: 'Public domain (U.S. Government)',
    attribution: { text: 'NOAA Tides & Currents', url: 'https://tidesandcurrents.noaa.gov/' },
    redistribution: '制限なし',
    apiKey: 'none',
    cors: true,
    sourceRole: 'observation',
    defaultRole: 'observed',
    derivation: 'measured',
    defaultQuality: 'preliminary',
    freshness: { expectedIntervalMin: 6, staleAfterMin: 60 },
    poll: { nominalMs: 10 * MIN },
    notes: '米国管理の検潮所のみ(太平洋の一部を含む)。リアルタイム値は暫定',
  },
  {
    id: 'openmeteo-air',
    label: 'AIR QUALITY',
    owner: 'Open-Meteo / Copernicus CAMS',
    domain: 'environment',
    status: 'planned',
    endpoints: ['https://air-quality-api.open-meteo.com/v1/air-quality'],
    license: `${OM_LICENSE}。CAMS は Copernicus 利用条件`,
    attribution: {
      text: 'Open-Meteo.com / Contains modified Copernicus Atmosphere Monitoring Service information',
      url: 'https://open-meteo.com/en/docs/air-quality-api',
    },
    redistribution: '出典明記で可',
    apiKey: 'none',
    cors: true,
    sourceRole: 'forecast',
    defaultRole: 'forecast',
    derivation: 'modeled',
    freshness: { expectedIntervalMin: 60, staleAfterMin: 12 * 60 },
    poll: { nominalMs: 60 * MIN },
    notes: 'CAMS モデル値(MODEL)。日本域の花粉データはない',
  },

  // ── Space / global ─────────────────────────────────────────────────────────
  {
    id: 'swpc',
    label: 'NOAA SWPC',
    owner: 'NOAA Space Weather Prediction Center',
    domain: 'space',
    status: 'planned',
    endpoints: ['https://services.swpc.noaa.gov/json/', 'https://services.swpc.noaa.gov/products/'],
    license: 'Public domain (U.S. Government)',
    attribution: { text: 'NOAA SWPC', url: 'https://www.swpc.noaa.gov/' },
    redistribution: '制限なし',
    apiKey: 'none',
    cors: true,
    sourceRole: 'observation',
    defaultRole: 'observed',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 1, staleAfterMin: 20 },
    poll: {
      nominalMs: 5 * MIN,
      activeMs: 1 * MIN,
      activeWhen: { signal: 'geomagnetic', minKp: 5 },
    },
    notes: '太陽風・IMF・X線は観測、OVATION オーロラは予測モデル、G/S/R スケールは評価',
  },
  {
    id: 'eonet',
    label: 'NASA EONET',
    owner: 'NASA Earth Observatory',
    domain: 'global',
    status: 'planned',
    endpoints: ['https://eonet.gsfc.nasa.gov/api/v3/events'],
    license: 'NASA open data',
    attribution: { text: 'NASA EONET', url: 'https://eonet.gsfc.nasa.gov/' },
    redistribution: '制限なし(出典表記推奨)',
    apiKey: 'none',
    cors: true,
    sourceRole: 'aggregation',
    defaultRole: 'observed',
    derivation: 'derived',
    freshness: { expectedIntervalMin: 60, staleAfterMin: 6 * 60 },
    poll: { nominalMs: 15 * MIN },
    notes: '自然現象の追跡カタログ(集約)。影響評価ではない',
  },
  {
    id: 'gdacs',
    label: 'GDACS',
    owner: 'GDACS (UN OCHA / European Commission JRC)',
    domain: 'global',
    status: 'planned',
    endpoints: ['https://www.gdacs.org/gdacsapi/api/events/geteventlist/'],
    license: 'GDACS 利用条件(出典明記で利用可)',
    attribution: { text: 'GDACS', url: 'https://www.gdacs.org/' },
    redistribution: '出典明記で可',
    apiKey: 'none',
    cors: true,
    sourceRole: 'assessment',
    defaultRole: 'observed',
    derivation: 'derived',
    freshness: { expectedIntervalMin: 60, staleAfterMin: 6 * 60 },
    poll: { nominalMs: 15 * MIN },
    notes: 'Green/Orange/Red は人的影響の評価(ASSESSMENT)',
  },
  {
    id: 'relay-firms',
    label: 'NASA FIRMS',
    owner: 'NASA FIRMS (LANCE)',
    domain: 'global',
    status: 'planned',
    endpoints: ['(relay) /firms'],
    license: 'NASA open data',
    attribution: { text: 'NASA FIRMS', url: 'https://firms.modaps.eosdis.nasa.gov/' },
    redistribution: '制限なし(出典表記推奨)',
    apiKey: 'relay-secret',
    cors: false,
    rateLimit: 'MAP_KEY あたり 10分 5,000 transactions(中継 cron で上限を固定)',
    sourceRole: 'observation',
    defaultRole: 'observed',
    derivation: 'measured',
    defaultQuality: 'preliminary',
    freshness: { expectedIntervalMin: 30, staleAfterMin: 6 * 60 },
    poll: { nominalMs: 10 * MIN },
    notes: '衛星による熱異常の検出(1検出=1観測)。火災イベントは AERIS がクラスタ化した派生',
  },
  {
    id: 'relay-nhc',
    label: 'NOAA NHC',
    owner: 'NOAA National Hurricane Center',
    domain: 'global',
    status: 'planned',
    endpoints: ['(relay) /nhc'],
    license: 'Public domain (U.S. Government)',
    attribution: { text: 'NOAA NHC', url: 'https://www.nhc.noaa.gov/' },
    redistribution: '制限なし',
    apiKey: 'none',
    cors: false,
    sourceRole: 'forecast',
    defaultRole: 'analysis',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 180, staleAfterMin: 8 * 60 },
    poll: { nominalMs: 15 * MIN },
  },

  // ── Map / geocoding ────────────────────────────────────────────────────────
  {
    id: 'basemap',
    label: 'BASEMAP',
    owner: 'OpenFreeMap / OpenStreetMap',
    domain: 'map',
    status: 'active',
    endpoints: ['https://tiles.openfreemap.org/planet'],
    license: 'ODbL (OpenStreetMap) / OpenMapTiles',
    attribution: { text: 'OpenFreeMap © OpenMapTiles © OpenStreetMap contributors' },
    redistribution: 'ODbL に従う',
    apiKey: 'none',
    cors: true,
    sourceRole: 'observation',
    defaultRole: 'observed',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 7 * 24 * 60, staleAfterMin: 30 * 24 * 60 },
    poll: { nominalMs: 0 },
  },
  {
    id: 'gsi-geocoder',
    label: 'GSI GEOCODER',
    owner: '国土地理院',
    domain: 'geocode',
    status: 'active',
    endpoints: ['https://mreversegeocoder.gsi.go.jp/', 'https://msearch.gsi.go.jp/'],
    license: '国土地理院コンテンツ利用規約(政府標準利用規約準拠)',
    attribution: { text: '国土地理院', url: 'https://www.gsi.go.jp/' },
    redistribution: '出典明記で可',
    apiKey: 'none',
    cors: true,
    sourceRole: 'observation',
    defaultRole: 'observed',
    derivation: 'measured',
    freshness: { expectedIntervalMin: 24 * 60, staleAfterMin: 365 * 24 * 60 },
    poll: { nominalMs: 0 },
  },
]

const BY_ID = new Map(SOURCES.map((s) => [s.id, s]))

export function sourceSpec(id: SourceId): SourceSpec | undefined {
  return BY_ID.get(id)
}

/** Freshness limit for health checks (minutes). */
export function staleAfterMin(id: SourceId, fallback = 60): number {
  return BY_ID.get(id)?.freshness.staleAfterMin ?? fallback
}

export function nominalPollMs(id: SourceId): number {
  return BY_ID.get(id)?.poll.nominalMs ?? 10 * MIN
}
