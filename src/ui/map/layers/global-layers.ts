/**
 * Global layers: FIRMS active-fire detections (observations, faded by age)
 * and markers for tracked / assessed events (EONET, GDACS, AERIS fire
 * clusters). Markers are coloured by GDACS level when one is linked.
 */
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { FONT, MAP_COLORS } from '../style'
import { pickPoint, type MapLayerDef, type MapScene } from './types'

function firesGeoJSON(s: MapScene) {
  return {
    type: 'FeatureCollection' as const,
    features: s.fireDetections.map((f) => ({
      type: 'Feature' as const,
      properties: { frp: f.frp ?? 0, fresh: 1 - f.age },
      geometry: { type: 'Point' as const, coordinates: [f.lon, f.lat] },
    })),
  }
}

export const fireLayer: MapLayerDef = {
  id: 'fires',
  toggle: 'fire',
  styleLayers: ['fires'],
  add(map, s) {
    map.addSource('fires', { type: 'geojson', data: firesGeoJSON(s) })
    map.addLayer({
      id: 'fires',
      type: 'circle',
      source: 'fires',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'frp'], 0, 2, 50, 3.5, 300, 6],
        'circle-color': ['interpolate', ['linear'], ['get', 'frp'], 0, '#ffb000', 100, '#ff5536'],
        'circle-opacity': ['*', 0.85, ['get', 'fresh']],
        'circle-blur': 0.3,
      },
    })
  },
  deps: (s) => [s.fireDetections],
  update(map, s) {
    ;(map.getSource('fires') as GeoJSONSource | undefined)?.setData(firesGeoJSON(s))
  },
}

function markersGeoJSON(s: MapScene) {
  return {
    type: 'FeatureCollection' as const,
    features: s.globalMarkers.map((m) => ({
      type: 'Feature' as const,
      properties: {
        id: m.id,
        tag: m.tag,
        rank: m.rank,
        sel: m.id === s.selectedEventId ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [m.lon, m.lat] },
    })),
  }
}

const RANK_COLOR = [
  'match',
  ['get', 'rank'],
  3,
  '#ff5536',
  2,
  '#ffb000',
  1,
  '#5ef08a',
  MAP_COLORS.cyan,
] as unknown as string

export const globalLayer: MapLayerDef = {
  id: 'global',
  toggle: 'global',
  styleLayers: ['global-markers', 'global-labels'],
  add(map, s, handlers) {
    map.addSource('global', { type: 'geojson', data: markersGeoJSON(s) })
    map.addLayer({
      id: 'global-markers',
      type: 'circle',
      source: 'global',
      paint: {
        'circle-radius': ['case', ['==', ['get', 'sel'], 1], 7, 5],
        'circle-color': MAP_COLORS.bg,
        'circle-stroke-color': RANK_COLOR,
        'circle-stroke-width': 2,
      },
    })
    map.addLayer({
      id: 'global-labels',
      type: 'symbol',
      source: 'global',
      layout: {
        'text-field': ['get', 'tag'],
        'text-font': FONT,
        'text-size': 9,
        'text-offset': [0, 1.2],
        'text-optional': true,
      },
      paint: { 'text-color': RANK_COLOR, 'text-halo-color': MAP_COLORS.bg, 'text-halo-width': 1 },
    })
    map.on('click', 'global-markers', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id
      if (id) handlers().onSelect(String(id), pickPoint(e))
    })
    map.on('mouseenter', 'global-markers', () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', 'global-markers', () => (map.getCanvas().style.cursor = ''))
  },
  deps: (s) => [s.globalMarkers, s.selectedEventId],
  update(map, s) {
    ;(map.getSource('global') as GeoJSONSource | undefined)?.setData(markersGeoJSON(s))
  },
}
