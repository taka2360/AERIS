/**
 * OVATION aurora probability (NOAA SWPC forecast model) as a heatmap.
 * Shown only near the forecast's own valid time.
 */
import type { GeoJSONSource } from 'maplibre-gl'
import type { MapLayerDef, MapScene } from './types'

function auroraGeoJSON(s: MapScene) {
  return {
    type: 'FeatureCollection' as const,
    features: s.auroraCells.map(([lon, lat, p]) => ({
      type: 'Feature' as const,
      properties: { p },
      geometry: { type: 'Point' as const, coordinates: [lon, lat] },
    })),
  }
}

export const auroraLayer: MapLayerDef = {
  id: 'aurora',
  toggle: 'aurora',
  styleLayers: ['aurora'],
  add(map, s) {
    map.addSource('aurora', { type: 'geojson', data: auroraGeoJSON(s) })
    map.addLayer({
      id: 'aurora',
      type: 'heatmap',
      source: 'aurora',
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'p'], 0, 0, 100, 1],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 4, 18],
        'heatmap-intensity': 0.9,
        'heatmap-opacity': 0.7,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(0,0,0,0)',
          0.2,
          'rgba(94,240,138,0.35)',
          0.5,
          'rgba(94,240,138,0.7)',
          0.8,
          'rgba(255,225,74,0.8)',
          1,
          'rgba(255,85,54,0.9)',
        ],
      },
    })
  },
  deps: (s) => [s.auroraCells],
  update(map, s) {
    ;(map.getSource('aurora') as GeoJSONSource | undefined)?.setData(auroraGeoJSON(s))
  },
}
