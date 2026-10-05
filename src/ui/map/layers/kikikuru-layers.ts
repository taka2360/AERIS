/**
 * キキクル on the map: 土砂 / 浸水 as classification rasters, 洪水 as river
 * lines from JMA's vector tiles. JMA publishes tiles at even zoom levels
 * only; for vector tiles (which cannot be cropped) one source per even zoom
 * band is used, each shown only within its band.
 */
import type { Map as MapLibreMap, VectorTileSource } from 'maplibre-gl'
import { MAP_COLORS } from '../style'
import { jmaRasterLayer } from './base-layers'
import type { MapLayerDef } from './types'

export const landLayer = jmaRasterLayer({
  id: 'kiki-land',
  toggle: 'land',
  palette: 'kikikuru',
  url: (s) => s.landTileUrl,
  maxzoom: 10,
  opacity: 0.85,
})

export const inundationLayer = jmaRasterLayer({
  id: 'kiki-inund',
  toggle: 'inund',
  palette: 'kikikuru',
  url: (s) => s.inundTileUrl,
  maxzoom: 10,
  opacity: 0.85,
})

/** [native zoom, show from, show until) — each band reads one even zoom. */
const FLOOD_BANDS: Array<[number, number, number]> = [
  [4, 0, 6],
  [6, 6, 8],
  [8, 8, 10],
  [10, 10, 24],
]

/** 洪水キキクル levels (JMA: 1 注意 … 4 災害切迫, otherwise 留意) in AERIS colours. */
const LEVEL_COLOR = [
  'match',
  ['get', 'level'],
  1,
  '#ffe14a',
  2,
  '#ff5536',
  3,
  '#c18bff',
  4,
  '#ff3cc8',
  MAP_COLORS.cyan,
] as unknown as string

const bandId = (z: number) => `kiki-flood-${z}`

export const floodLayer: MapLayerDef = {
  id: 'kiki-flood',
  toggle: 'flood',
  styleLayers: FLOOD_BANDS.map(([z]) => bandId(z)),
  overlaySources: FLOOD_BANDS.map(([z]) => bandId(z)),
  add(map, s) {
    for (const [z, from, until] of FLOOD_BANDS) {
      map.addSource(bandId(z), {
        type: 'vector',
        tiles: s.floodTileUrl ? [s.floodTileUrl] : [],
        minzoom: z,
        maxzoom: z,
      })
      map.addLayer({
        id: bandId(z),
        type: 'line',
        source: bandId(z),
        'source-layer': 'flood',
        minzoom: from,
        maxzoom: until,
        // Background level (留意) is not drawn: only rivers with a risk level.
        filter: ['in', ['get', 'level'], ['literal', [1, 2, 3, 4]]],
        paint: {
          'line-color': LEVEL_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 10, 3],
        },
      })
    }
  },
  deps: (s) => [s.floodTileUrl],
  update(map: MapLibreMap, s) {
    for (const [z] of FLOOD_BANDS)
      (map.getSource(bandId(z)) as VectorTileSource | undefined)?.setTiles(
        s.floodTileUrl ? [s.floodTileUrl] : [],
      )
  },
}
