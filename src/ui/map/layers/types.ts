/**
 * Map layer registry contract. Each overlay is a self-contained definition:
 * it adds its sources/layers once, declares which slices of the scene it
 * depends on, and updates only when those slices change. Draw order is the
 * order of the registry (first = bottom).
 */
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { StationObservation, WindSample } from '@/domain/model'

/** Everything the map can draw at one moment. Layers read only what they need. */
export type MapScene = {
  center: { lat: number; lon: number }
  rangeKm: number
  rings: number[]
  stations: StationObservation[]
  wind: WindSample[]
  radarTileUrl: string | null
  focusId: string | null
}

/** User-facing toggle keys. Several definitions may share one toggle. */
export type LayerToggle = 'echo' | 'stn' | 'wind' | 'grid'

export type LayerVisibility = Record<LayerToggle, boolean>

export type LayerHandlers = {
  onFocus: (id: string) => void
}

export type MapLayerDef = {
  id: string
  toggle: LayerToggle
  /** MapLibre style-layer ids owned by this definition (for visibility) */
  styleLayers: string[]
  /** Source ids whose errors are expected gaps, not basemap failures */
  overlaySources?: string[]
  add(map: MapLibreMap, scene: MapScene, handlers: () => LayerHandlers): void
  /** Values compared by identity to decide whether update() must run */
  deps(scene: MapScene): unknown[]
  update(map: MapLibreMap, scene: MapScene): void
}
