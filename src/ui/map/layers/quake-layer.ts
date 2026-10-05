/**
 * Earthquakes on the map: epicentres sized by magnitude and faded by age
 * (at the cursor time), plus per-station JMA intensity for the selected one.
 */
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { FONT, MAP_COLORS } from '../style'
import type { MapLayerDef, MapScene } from './types'

/** Intensity class colours (rank in INTENSITY_ORDER → colour). */
const INTENSITY_COLORS: Array<[number, string]> = [
  [1, '#7a6f55'],
  [2, '#a89a78'],
  [3, MAP_COLORS.cyan],
  [4, '#ffe14a'],
  [5, '#ff5536'],
  [7, '#c18bff'],
]

function quakesGeoJSON(s: MapScene) {
  return {
    type: 'FeatureCollection' as const,
    features: s.quakes.map((q, i) => ({
      type: 'Feature' as const,
      id: i,
      properties: {
        id: q.id,
        mag: q.magnitude ?? 0,
        label: q.magnitude != null ? `M${q.magnitude.toFixed(1)}` : '',
        fresh: 1 - q.age,
        severe: q.severe ? 1 : 0,
        selected: q.id === s.selectedEventId ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [q.lon, q.lat] },
    })),
  }
}

function stationsGeoJSON(s: MapScene) {
  return {
    type: 'FeatureCollection' as const,
    features: s.intensityStations.map((st) => ({
      type: 'Feature' as const,
      properties: { rank: st.rank, label: st.label },
      geometry: { type: 'Point' as const, coordinates: [st.lon, st.lat] },
    })),
  }
}

const intensityColor = [
  'step',
  ['get', 'rank'],
  '#4a3c1c',
  ...INTENSITY_COLORS.flatMap(([r, c]) => [r, c]),
] as unknown as string

export const quakeLayer: MapLayerDef = {
  id: 'quakes',
  toggle: 'quake',
  styleLayers: ['quake-stations', 'quake-station-labels', 'quakes', 'quake-labels'],
  add(map, s, handlers) {
    map.addSource('quake-stations', { type: 'geojson', data: stationsGeoJSON(s) })
    map.addLayer({
      id: 'quake-stations',
      type: 'circle',
      source: 'quake-stations',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2, 9, 5],
        'circle-color': intensityColor,
        'circle-stroke-color': MAP_COLORS.bg,
        'circle-stroke-width': 0.6,
      },
    })
    map.addLayer({
      id: 'quake-station-labels',
      type: 'symbol',
      source: 'quake-stations',
      minzoom: 7,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT,
        'text-size': 10,
        'text-offset': [0, -0.9],
      },
      paint: {
        'text-color': intensityColor,
        'text-halo-color': MAP_COLORS.bg,
        'text-halo-width': 1.2,
      },
    })

    map.addSource('quakes', { type: 'geojson', data: quakesGeoJSON(s) })
    map.addLayer({
      id: 'quakes',
      type: 'circle',
      source: 'quakes',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 2, 3, 5, 7, 7, 15, 9, 24],
        'circle-color': MAP_COLORS.amber,
        'circle-opacity': ['interpolate', ['linear'], ['get', 'fresh'], 0, 0.08, 1, 0.45],
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'selected'], 1],
          MAP_COLORS.text,
          ['==', ['get', 'severe'], 1],
          '#ff5536',
          MAP_COLORS.amber,
        ],
        'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 2.2, 1.1],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['get', 'fresh'], 0, 0.35, 1, 1],
      },
    })
    map.addLayer({
      id: 'quake-labels',
      type: 'symbol',
      source: 'quakes',
      filter: ['any', ['>=', ['get', 'mag'], 5], ['==', ['get', 'selected'], 1]],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT,
        'text-size': 10,
        'text-offset': [0, 1.4],
        'text-optional': true,
      },
      paint: {
        'text-color': MAP_COLORS.amberHi,
        'text-halo-color': MAP_COLORS.bg,
        'text-halo-width': 1.2,
      },
    })
    map.on('click', 'quakes', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id
      if (id) handlers().onSelect(String(id))
    })
    map.on('mouseenter', 'quakes', () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', 'quakes', () => (map.getCanvas().style.cursor = ''))
  },
  deps: (s) => [s.quakes, s.selectedEventId, s.intensityStations],
  update(map, s) {
    ;(map.getSource('quakes') as GeoJSONSource | undefined)?.setData(quakesGeoJSON(s))
    ;(map.getSource('quake-stations') as GeoJSONSource | undefined)?.setData(stationsGeoJSON(s))
  },
}
