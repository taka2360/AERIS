/**
 * Environment fields on the map: JMA snow analyses (rasters) and the modeled
 * wave / sea-surface-temperature grid (Open-Meteo Marine, MODEL).
 */
import type { GeoJSONSource } from 'maplibre-gl'
import { FONT, MAP_COLORS } from '../style'
import { jmaRasterLayer } from './base-layers'
import type { MapLayerDef, MapScene } from './types'

export const snowDepthLayer = jmaRasterLayer({
  id: 'snow-depth',
  toggle: 'snowd',
  palette: 'snow',
  url: (s) => s.snowDepthTileUrl,
  maxzoom: 10,
})

export const snowfallLayer = jmaRasterLayer({
  id: 'snowfall',
  toggle: 'snowf',
  palette: 'snowfall',
  url: (s) => s.snowfallTileUrl,
  maxzoom: 10,
})

function waveGeoJSON(s: MapScene) {
  return {
    type: 'FeatureCollection' as const,
    features: s.marineCells.map((c) => ({
      type: 'Feature' as const,
      properties: {
        wave: c.wave,
        dir: c.dir ?? 0,
        label: `${c.wave.toFixed(1)}m${c.sst != null ? ` ${c.sst.toFixed(0)}°` : ''}`,
      },
      geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
    })),
  }
}

export const waveLayer: MapLayerDef = {
  id: 'waves',
  toggle: 'wave',
  styleLayers: ['waves', 'wave-labels'],
  add(map, s) {
    map.addSource('waves', { type: 'geojson', data: waveGeoJSON(s) })
    map.addLayer({
      id: 'waves',
      type: 'circle',
      source: 'waves',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'wave'], 0, 3, 3, 7, 8, 14],
        'circle-color': [
          'step',
          ['get', 'wave'],
          MAP_COLORS.cyan,
          2.5,
          '#ffe14a',
          4,
          '#ff5536',
          6,
          '#c18bff',
        ],
        'circle-opacity': 0.35,
        'circle-stroke-color': MAP_COLORS.cyan,
        'circle-stroke-width': 0.6,
      },
    })
    map.addLayer({
      id: 'wave-labels',
      type: 'symbol',
      source: 'waves',
      minzoom: 4,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT,
        'text-size': 9,
        'text-offset': [0, 1.3],
      },
      paint: {
        'text-color': MAP_COLORS.cyan,
        'text-halo-color': MAP_COLORS.bg,
        'text-halo-width': 1,
      },
    })
  },
  deps: (s) => [s.marineCells],
  update(map, s) {
    ;(map.getSource('waves') as GeoJSONSource | undefined)?.setData(waveGeoJSON(s))
  },
}
