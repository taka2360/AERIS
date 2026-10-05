/**
 * User-facing layer catalogue: groups, labels and which layers are raster
 * fields. Only one raster field is shown at a time so colour scales never
 * overlap; point and line layers can be combined freely.
 */
import type { LayerToggle, LayerVisibility } from './types'

export type LayerEntry = {
  id: LayerToggle
  label: string
  group: 'ATMOS' | 'HYDRO' | 'ENV' | 'SPACE' | 'GLOBAL' | 'OBS' | 'GEO'
  /** Raster fields are mutually exclusive */
  raster?: boolean
  desc: string
}

export const LAYER_CATALOG: LayerEntry[] = [
  { id: 'echo', label: 'RADAR', group: 'ATMOS', raster: true, desc: '降水ナウキャスト(気象庁)' },
  {
    id: 'ltng',
    label: 'LTNG',
    group: 'ATMOS',
    raster: true,
    desc: '雷活動度(気象庁 雷ナウキャスト)',
  },
  { id: 'strk', label: 'STRIKES', group: 'ATMOS', desc: '個別の雷・落雷(気象庁 LIDEN)' },
  { id: 'torn', label: 'TORNADO', group: 'ATMOS', desc: '竜巻発生確度(気象庁)' },
  { id: 'wind', label: 'WIND', group: 'ATMOS', desc: '風(数値モデル)' },
  { id: 'cyclone', label: 'CYCLONE', group: 'ATMOS', desc: '台風・熱帯低気圧(気象庁)' },
  { id: 'land', label: 'LANDSLIDE', group: 'HYDRO', raster: true, desc: '土砂キキクル(気象庁)' },
  { id: 'inund', label: 'INUNDATION', group: 'HYDRO', raster: true, desc: '浸水キキクル(気象庁)' },
  { id: 'flood', label: 'FLOOD', group: 'HYDRO', desc: '洪水キキクル・河川(気象庁)' },
  {
    id: 'snowd',
    label: 'SNOW DEPTH',
    group: 'ENV',
    raster: true,
    desc: '解析積雪深(気象庁・推定)',
  },
  {
    id: 'snowf',
    label: 'SNOWFALL',
    group: 'ENV',
    raster: true,
    desc: '解析降雪量 3時間(気象庁・推定)',
  },
  { id: 'wave', label: 'WAVES', group: 'ENV', desc: '波高・海面水温(モデル)' },
  { id: 'aurora', label: 'AURORA', group: 'SPACE', desc: 'オーロラ出現確率(NOAA OVATION 予測)' },
  { id: 'fire', label: 'FIRES', group: 'GLOBAL', desc: '衛星の熱異常検出(NASA FIRMS)' },
  {
    id: 'global',
    label: 'EVENTS',
    group: 'GLOBAL',
    desc: '全球イベント(EONET・GDACS・火災クラスタ)',
  },
  { id: 'grid', label: 'RINGS', group: 'OBS', desc: '距離リング' },
  { id: 'quake', label: 'QUAKE', group: 'GEO', desc: '地震(気象庁・USGS)' },
  { id: 'tsunami', label: 'TSUNAMI', group: 'GEO', desc: '津波警報・注意報・予報(気象庁)' },
  { id: 'volcano', label: 'VOLCANO', group: 'GEO', desc: '活火山・噴火警報(気象庁)' },
]

export const DEFAULT_LAYERS: LayerVisibility = {
  echo: true,
  ltng: false,
  strk: true,
  torn: true,
  wind: true,
  grid: true,
  quake: true,
  tsunami: true,
  cyclone: true,
  volcano: true,
  land: false,
  inund: false,
  flood: true,
  snowd: false,
  snowf: false,
  wave: false,
  aurora: false,
  fire: true,
  global: true,
}

/** Toggle a layer; switching a raster field on switches the other rasters off. */
export function toggleLayer(v: LayerVisibility, id: LayerToggle): LayerVisibility {
  const entry = LAYER_CATALOG.find((e) => e.id === id)
  const on = !v[id]
  const next = { ...v, [id]: on }
  if (on && entry?.raster)
    for (const other of LAYER_CATALOG) if (other.raster && other.id !== id) next[other.id] = false
  return next
}
