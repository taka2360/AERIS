/**
 * The original SPATIAL SCOPE overlays — radar echo, range rings, wind and
 * AMeDAS stations — as registry definitions.
 */
import { type GeoJSONSource, type RasterTileSource } from 'maplibre-gl'
import { ringsGeoJSON, windGeoJSON } from '../geo'
import { jmaTiles, registerJmaProtocol } from '../jma-protocol'
import { FONT, MAP_COLORS, type TilePaletteId } from '../style'
import type { WindSample } from '@/domain/model'
import type { MapLayerDef, MapScene } from './types'

export const JMA_ATTRIBUTION = '<a href="https://www.jma.go.jp/" target="_blank">気象庁</a>'

registerJmaProtocol()

function arrowImage(): ImageData {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  g.strokeStyle = MAP_COLORS.cyan
  g.fillStyle = MAP_COLORS.cyan
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(16, 28)
  g.lineTo(16, 8)
  g.stroke()
  g.beginPath()
  g.moveTo(16, 2)
  g.lineTo(21, 11)
  g.lineTo(11, 11)
  g.closePath()
  g.fill()
  return g.getImageData(0, 0, size, size)
}

export const radarLayer: MapLayerDef = {
  id: 'radar',
  toggle: 'echo',
  styleLayers: ['radar'],
  overlaySources: ['radar'],
  add(map, scene) {
    map.addSource('radar', {
      type: 'raster',
      tiles: jmaTiles(scene.radarTileUrl, 'precip'),
      tileSize: 256,
      minzoom: 4,
      maxzoom: 10,
      attribution: JMA_ATTRIBUTION,
    })
    map.addLayer({
      id: 'radar',
      type: 'raster',
      source: 'radar',
      paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
    })
  },
  deps: (s) => [s.radarTileUrl],
  update(map, s) {
    if (!s.radarTileUrl) return
    ;(map.getSource('radar') as RasterTileSource | undefined)?.setTiles(
      jmaTiles(s.radarTileUrl, 'precip'),
    )
  },
}

export const ringsLayer: MapLayerDef = {
  id: 'rings',
  toggle: 'grid',
  styleLayers: ['rings', 'ring-labels'],
  add(map, s) {
    map.addSource('rings', {
      type: 'geojson',
      data: ringsGeoJSON(s.center.lat, s.center.lon, s.rings),
    })
    map.addLayer({
      id: 'rings',
      type: 'line',
      source: 'rings',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': MAP_COLORS.amber,
        'line-width': 0.8,
        'line-opacity': 0.45,
        'line-dasharray': [2, 3],
      },
    })
    map.addLayer({
      id: 'ring-labels',
      type: 'symbol',
      source: 'rings',
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 10 },
      paint: {
        'text-color': MAP_COLORS.amber,
        'text-opacity': 0.7,
        'text-halo-color': MAP_COLORS.bg,
        'text-halo-width': 1,
      },
    })
  },
  deps: (s) => [s.center.lat, s.center.lon, s.rings],
  update(map, s) {
    ;(map.getSource('rings') as GeoJSONSource | undefined)?.setData(
      ringsGeoJSON(s.center.lat, s.center.lon, s.rings),
    )
  },
}

/**
 * Zoom bands of the wind grids (exclusive upper bound). Each grid is shown
 * only where its spacing reads as a field: the fine local grid covers ±0.3°
 * and would leave the rest of a zoomed-out view empty.
 */
export const WIND_ZOOM = { globeUntil: 3, regionMajorUntil: 5, regionUntil: 7.5 } as const

const WIND_TIERS: Array<{
  id: string
  pick: (s: MapScene) => WindSample[]
  minzoom?: number
  maxzoom?: number
  /** Thin the grid to every other point (spacing ×2) */
  major?: boolean
}> = [
  { id: 'wind-globe', pick: (s) => s.windGlobe, maxzoom: WIND_ZOOM.globeUntil },
  {
    id: 'wind-region-major',
    pick: (s) => s.windRegion,
    minzoom: WIND_ZOOM.globeUntil,
    maxzoom: WIND_ZOOM.regionMajorUntil,
    major: true,
  },
  {
    id: 'wind-region',
    pick: (s) => s.windRegion,
    minzoom: WIND_ZOOM.regionMajorUntil,
    maxzoom: WIND_ZOOM.regionUntil,
  },
  { id: 'wind', pick: (s) => s.wind, minzoom: WIND_ZOOM.regionUntil },
]

const windSourceId = (tier: string) => (tier === 'wind-region-major' ? 'wind-region' : tier)

export const windLayer: MapLayerDef = {
  id: 'wind',
  toggle: 'wind',
  styleLayers: WIND_TIERS.map((w) => w.id),
  add(map, s) {
    if (!map.hasImage('wind-arrow')) map.addImage('wind-arrow', arrowImage(), { pixelRatio: 2 })
    for (const tier of WIND_TIERS) {
      const source = windSourceId(tier.id)
      if (!map.getSource(source))
        map.addSource(source, { type: 'geojson', data: windGeoJSON(tier.pick(s)) })
      map.addLayer({
        id: tier.id,
        type: 'symbol',
        source,
        ...(tier.minzoom != null && { minzoom: tier.minzoom }),
        ...(tier.maxzoom != null && { maxzoom: tier.maxzoom }),
        ...(tier.major && { filter: ['==', ['get', 'major'], true] }),
        layout: {
          'icon-image': 'wind-arrow',
          // Arrow points where the wind blows TO.
          'icon-rotate': ['+', ['get', 'direction'], 180],
          'icon-rotation-alignment': 'map',
          'icon-size': ['interpolate', ['linear'], ['get', 'speed'], 0, 0.6, 15, 1.4],
          'icon-allow-overlap': true,
        },
        paint: { 'icon-opacity': 0.6 },
      })
    }
  },
  deps: (s) => [s.wind, s.windRegion, s.windGlobe],
  update(map, s) {
    for (const tier of WIND_TIERS) {
      if (tier.id === 'wind-region-major') continue
      ;(map.getSource(tier.id) as GeoJSONSource | undefined)?.setData(windGeoJSON(tier.pick(s)))
    }
  },
}

/** A JMA classification raster (e.g. 雷活動度) drawn from the scene's tile URL. */
export function jmaRasterLayer(opts: {
  id: string
  toggle: MapLayerDef['toggle']
  palette: TilePaletteId
  url: (s: MapScene) => string | null
  maxzoom: number
  opacity?: number
}): MapLayerDef {
  return {
    id: opts.id,
    toggle: opts.toggle,
    styleLayers: [opts.id],
    overlaySources: [opts.id],
    add(map, s) {
      map.addSource(opts.id, {
        type: 'raster',
        tiles: jmaTiles(opts.url(s), opts.palette),
        tileSize: 256,
        minzoom: 4,
        maxzoom: opts.maxzoom,
        attribution: JMA_ATTRIBUTION,
      })
      map.addLayer({
        id: opts.id,
        type: 'raster',
        source: opts.id,
        paint: {
          'raster-opacity': opts.opacity ?? 0.9,
          'raster-fade-duration': 0,
          'raster-resampling': 'nearest',
        },
      })
    },
    deps: (s) => [opts.url(s)],
    update(map, s) {
      const url = opts.url(s)
      const src = map.getSource(opts.id) as RasterTileSource | undefined
      // No frame valid at the cursor time: show nothing rather than a stale frame.
      src?.setTiles(url ? jmaTiles(url, opts.palette) : [])
    },
  }
}

export const lightningLayer = jmaRasterLayer({
  id: 'lightning',
  toggle: 'ltng',
  palette: 'thunder',
  url: (s) => s.lightningTileUrl,
  maxzoom: 8,
})

export const tornadoLayer = jmaRasterLayer({
  id: 'tornado',
  toggle: 'torn',
  palette: 'tornado',
  url: (s) => s.tornadoTileUrl,
  maxzoom: 8,
})

function strokesGeoJSON(s: MapScene) {
  return {
    type: 'FeatureCollection' as const,
    features: s.strokes.map((k) => ({
      type: 'Feature' as const,
      properties: { cg: k.cg ? 1 : 0, fresh: 1 - k.age },
      geometry: { type: 'Point' as const, coordinates: [k.lon, k.lat] },
    })),
  }
}

/** LIDEN strokes: cloud-to-ground bright, cloud discharges faint, fading with age. */
export const strokesLayer: MapLayerDef = {
  id: 'strokes',
  toggle: 'strk',
  styleLayers: ['strokes'],
  add(map, s) {
    map.addSource('strokes', { type: 'geojson', data: strokesGeoJSON(s) })
    map.addLayer({
      id: 'strokes',
      type: 'circle',
      source: 'strokes',
      paint: {
        'circle-radius': ['case', ['==', ['get', 'cg'], 1], 3.2, 1.8],
        'circle-color': ['case', ['==', ['get', 'cg'], 1], '#ffe14a', '#ffc94d'],
        'circle-opacity': ['*', ['get', 'fresh'], ['case', ['==', ['get', 'cg'], 1], 1, 0.55]],
        'circle-stroke-color': '#ffe14a',
        'circle-stroke-width': ['case', ['==', ['get', 'cg'], 1], 0.8, 0],
        'circle-stroke-opacity': ['get', 'fresh'],
      },
    })
  },
  deps: (s) => [s.strokes],
  update(map, s) {
    ;(map.getSource('strokes') as GeoJSONSource | undefined)?.setData(strokesGeoJSON(s))
  },
}
