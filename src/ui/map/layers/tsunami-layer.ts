/**
 * Tsunami forecast areas in force at the cursor time, drawn as coastlines
 * coloured by JMA class (大津波警報 / 警報 / 注意報 / 予報).
 */
import type { GeoJSONSource } from 'maplibre-gl'
import { MAP_COLORS } from '../style'
import type { MapLayerDef, MapScene } from './types'

/** JMA class rank → colour (AERIS palette, same order of urgency as JMA's). */
const RANK_COLOR = ['#7a6f55', MAP_COLORS.cyan, '#ffe14a', '#ff5536', '#c18bff']

function coastsGeoJSON(s: MapScene) {
  return {
    type: 'FeatureCollection' as const,
    features: s.tsunamiCoasts.map((c) => ({
      type: 'Feature' as const,
      properties: { code: c.code, rank: c.rank },
      geometry: { type: 'MultiLineString' as const, coordinates: c.lines },
    })),
  }
}

const rankColor = [
  'match',
  ['get', 'rank'],
  ...RANK_COLOR.flatMap((c, i) => [i, c]),
  RANK_COLOR[0],
] as unknown as string

export const tsunamiLayer: MapLayerDef = {
  id: 'tsunami',
  toggle: 'tsunami',
  styleLayers: ['tsunami-glow', 'tsunami-coast'],
  add(map, s) {
    map.addSource('tsunami', { type: 'geojson', data: coastsGeoJSON(s) })
    map.addLayer({
      id: 'tsunami-glow',
      type: 'line',
      source: 'tsunami',
      filter: ['>=', ['get', 'rank'], 2],
      paint: {
        'line-color': rankColor,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 6, 9, 14],
        'line-opacity': 0.25,
        'line-blur': 4,
      },
    })
    map.addLayer({
      id: 'tsunami-coast',
      type: 'line',
      source: 'tsunami',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': rankColor,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          4,
          ['+', 1.2, ['get', 'rank']],
          9,
          ['+', 3, ['*', 1.5, ['get', 'rank']]],
        ],
      },
    })
  },
  deps: (s) => [s.tsunamiCoasts],
  update(map, s) {
    ;(map.getSource('tsunami') as GeoJSONSource | undefined)?.setData(coastsGeoJSON(s))
  },
}
