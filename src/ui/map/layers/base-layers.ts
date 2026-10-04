/**
 * The original SPATIAL SCOPE overlays — radar echo, range rings, wind and
 * AMeDAS stations — as registry definitions.
 */
import {
  addProtocol,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type RasterTileSource,
} from 'maplibre-gl'
import { ringsGeoJSON, stationsGeoJSON, windGeoJSON } from '../geo'
import { FONT, MAP_COLORS, recolorRadarPixels } from '../style'
import type { MapLayerDef } from './types'

export const JMA_ATTRIBUTION = '<a href="https://www.jma.go.jp/" target="_blank">気象庁</a>'

/**
 * aeris-radar://… → fetch the JMA tile over https and repaint it in the AERIS
 * palette before MapLibre sees it. Runs on the main thread; ~65k px per tile.
 */
const RADAR_PROTOCOL = 'aeris-radar'
addProtocol(RADAR_PROTOCOL, async (params, abort) => {
  const res = await fetch(params.url.replace(`${RADAR_PROTOCOL}://`, 'https://'), {
    signal: abort.signal,
  })
  if (!res.ok) throw new Error(`radar tile HTTP ${res.status}`)
  const bitmap = await createImageBitmap(await res.blob())
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  recolorRadarPixels(img.data)
  ctx.putImageData(img, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return { data: await blob.arrayBuffer() }
})

const radarTiles = (url: string | null) =>
  url ? [url.replace(/^https:\/\//, `${RADAR_PROTOCOL}://`)] : []

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
      tiles: radarTiles(scene.radarTileUrl),
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
    ;(map.getSource('radar') as RasterTileSource | undefined)?.setTiles(radarTiles(s.radarTileUrl))
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

export const windLayer: MapLayerDef = {
  id: 'wind',
  toggle: 'wind',
  styleLayers: ['wind'],
  add(map, s) {
    if (!map.hasImage('wind-arrow')) map.addImage('wind-arrow', arrowImage(), { pixelRatio: 2 })
    map.addSource('wind', { type: 'geojson', data: windGeoJSON(s.wind) })
    map.addLayer({
      id: 'wind',
      type: 'symbol',
      source: 'wind',
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
  },
  deps: (s) => [s.wind],
  update(map, s) {
    ;(map.getSource('wind') as GeoJSONSource | undefined)?.setData(windGeoJSON(s.wind))
  },
}

export const stationsLayer: MapLayerDef = {
  id: 'stations',
  toggle: 'stn',
  styleLayers: ['stations', 'station-labels'],
  add(map, s, handlers) {
    map.addSource('stations', { type: 'geojson', data: stationsGeoJSON(s.stations) })
    map.addLayer({
      id: 'stations',
      type: 'circle',
      source: 'stations',
      paint: {
        'circle-radius': ['case', ['boolean', ['feature-state', 'focus'], false], 5, 3.5],
        'circle-color': [
          'case',
          ['boolean', ['feature-state', 'focus'], false],
          MAP_COLORS.amber,
          MAP_COLORS.bg,
        ],
        'circle-stroke-color': MAP_COLORS.amber,
        'circle-stroke-width': 1.2,
      },
    })
    map.addLayer({
      id: 'station-labels',
      type: 'symbol',
      source: 'stations',
      layout: {
        'text-field': ['get', 'temp'],
        'text-font': FONT,
        'text-size': 11,
        'text-offset': [0.6, 0],
        'text-anchor': 'left',
      },
      paint: {
        'text-color': MAP_COLORS.text,
        'text-halo-color': MAP_COLORS.bg,
        'text-halo-width': 1.4,
      },
    })
    map.on('mouseenter', 'stations', (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer'
      const id = e.features?.[0]?.properties?.id
      if (id) handlers().onFocus(String(id))
    })
    map.on('mouseleave', 'stations', () => {
      map.getCanvas().style.cursor = ''
    })
    if (s.focusId)
      map.setFeatureState({ source: 'stations', id: Number(s.focusId) }, { focus: true })
  },
  deps: (s) => [s.stations, s.focusId],
  update(map, s) {
    ;(map.getSource('stations') as GeoJSONSource | undefined)?.setData(stationsGeoJSON(s.stations))
    map.removeFeatureState({ source: 'stations' })
    if (s.focusId)
      map.setFeatureState({ source: 'stations', id: Number(s.focusId) }, { focus: true })
  },
}
