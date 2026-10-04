/**
 * User-facing layer catalogue: groups, labels and which layers are raster
 * fields. Only one raster field is shown at a time so colour scales never
 * overlap; point and line layers can be combined freely.
 */
import type { LayerToggle, LayerVisibility } from './types'

export type LayerEntry = {
  id: LayerToggle
  label: string
  group: 'ATMOS' | 'OBS' | 'GEO'
  /** Raster fields are mutually exclusive */
  raster?: boolean
  desc: string
}

export const LAYER_CATALOG: LayerEntry[] = [
  { id: 'echo', label: 'RADAR', group: 'ATMOS', raster: true, desc: '降水ナウキャスト(気象庁)' },
  { id: 'wind', label: 'WIND', group: 'ATMOS', desc: '風(数値モデル)' },
  { id: 'stn', label: 'STN', group: 'OBS', desc: 'アメダス観測点' },
  { id: 'grid', label: 'RINGS', group: 'OBS', desc: '距離リング' },
  { id: 'quake', label: 'QUAKE', group: 'GEO', desc: '地震(気象庁・USGS)' },
]

export const DEFAULT_LAYERS: LayerVisibility = {
  echo: true,
  stn: true,
  wind: true,
  grid: true,
  quake: true,
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
