/**
 * Map layer registry contract. Each overlay is a self-contained definition:
 * it adds its sources/layers once, declares which slices of the scene it
 * depends on, and updates only when those slices change. Draw order is the
 * order of the registry (first = bottom).
 */
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { TrackPoint } from '@/domain/earth/events'
import type { StationObservation, WindSample } from '@/domain/model'

/** Everything the map can draw at one moment. Layers read only what they need. */
export type MapScene = {
  center: { lat: number; lon: number }
  rangeKm: number
  rings: number[]
  stations: StationObservation[]
  wind: WindSample[]
  radarTileUrl: string | null
  lightningTileUrl: string | null
  tornadoTileUrl: string | null
  landTileUrl: string | null
  inundTileUrl: string | null
  /** 洪水キキクル vector tile template (.pbf) */
  floodTileUrl: string | null
  snowDepthTileUrl: string | null
  snowfallTileUrl: string | null
  /** Modeled wave / SST grid cells (MODEL) */
  marineCells: Array<{
    lat: number
    lon: number
    wave: number
    dir: number | null
    sst: number | null
  }>
  /** LIDEN strokes visible at the cursor time (age 0 → 1 over an hour) */
  strokes: Array<{ lat: number; lon: number; cg: boolean; age: number }>
  focusId: string | null
  /** Earthquakes visible at the cursor time; age 0 = just happened → 1 = fading out */
  quakes: Array<{
    id: string
    lat: number
    lon: number
    magnitude: number | null
    age: number
    severe: boolean
  }>
  selectedEventId: string | null
  /** JMA intensity stations of the selected earthquake (rank = intensity class ordinal) */
  intensityStations: Array<{ lat: number; lon: number; rank: number; label: string }>
  /** Tsunami forecast areas in force at the cursor time (rank = JMA class 1–4) */
  tsunamiCoasts: Array<{ code: string; rank: number; lines: [number, number][][] }>
  /** Monitored volcanoes; rank > 0 when a JMA bulletin is listed */
  volcanoes: Array<{
    selectId: string
    name: string
    lat: number
    lon: number
    rank: number
    levelShort: string
  }>
  /** Tropical cyclones with their stated geometry and the centre at the cursor time */
  cyclones: Array<{
    id: string
    label: string
    path: [number, number][]
    points: TrackPoint[]
    coneLines: [number, number][][]
    stormLines: [number, number][][]
    gale?: { lat: number; lon: number; radiusKm: number }
    at: { lat: number; lon: number; role: string } | null
  }>
}

/** User-facing toggle keys. Several definitions may share one toggle. */
export type LayerToggle =
  | 'echo'
  | 'ltng'
  | 'torn'
  | 'strk'
  | 'stn'
  | 'wind'
  | 'grid'
  | 'quake'
  | 'tsunami'
  | 'cyclone'
  | 'volcano'
  | 'land'
  | 'inund'
  | 'flood'
  | 'snowd'
  | 'snowf'
  | 'wave'

export type LayerVisibility = Record<LayerToggle, boolean>

export type LayerHandlers = {
  onFocus: (id: string) => void
  onSelect: (eventId: string) => void
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
