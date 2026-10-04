/**
 * MapLibre view — loaded lazily (own chunk). The map instance is created once;
 * data changes only call setData / setTiles, so nothing re-initialises.
 * Failure to create WebGL context or repeated basemap tile errors are reported
 * upward so the panel can fall back to the vector scope.
 */
import { useEffect, useRef } from 'react'
import {
  addProtocol,
  Map as MapLibreMap,
  Marker,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type RasterTileSource,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { StationObservation, WindSample } from '@/domain/model'
import { setMapStatus } from '@/query/map-status'
import { circleBounds, ringsGeoJSON, stationsGeoJSON, windGeoJSON } from './geo'
import { buildBaseStyle, FONT, MAP_COLORS, recolorRadarPixels } from './style'
import s from './MapView.module.css'

setWorkerUrl(workerUrl)

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

export type MapLayers = { echo: boolean; stn: boolean; wind: boolean; grid: boolean }

export type MapViewProps = {
  center: { lat: number; lon: number }
  rangeKm: number
  rings: number[]
  stations: StationObservation[]
  wind: WindSample[]
  radarTileUrl: string | null
  layers: MapLayers
  focusId: string | null
  onFocus: (id: string) => void
  onFailure: (reason: string) => void
  recenterToken: number
}

const RADAR_ATTRIBUTION = '<a href="https://www.jma.go.jp/" target="_blank">気象庁</a>'
const BASEMAP_ERROR_LIMIT = 8

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

function crosshairElement(): HTMLElement {
  const el = document.createElement('div')
  el.className = s.crosshair!
  el.setAttribute('aria-hidden', 'true')
  return el
}

export default function MapView(props: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const loaded = useRef(false)
  // Latest props for async map callbacks (load / hover), updated after each render.
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })

  // ── Create once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!container.current) return
    setMapStatus({ state: 'loading' })
    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: container.current,
        style: buildBaseStyle(),
        bounds: circleBounds(props.center.lat, props.center.lon, props.rangeKm),
        fitBoundsOptions: { padding: 12 },
        attributionControl: { compact: true, customAttribution: RADAR_ATTRIBUTION },
        dragRotate: false,
        pitchWithRotate: false,
        maxZoom: 13,
        minZoom: 4,
        // Japanese labels rendered with a local font instead of downloading CJK glyphs.
        localIdeographFontFamily: "'BIZ UDGothic', 'Noto Sans JP', sans-serif",
      })
    } catch (e) {
      setMapStatus({ state: 'unsupported', detail: 'WEBGL UNAVAILABLE' })
      props.onFailure(e instanceof Error ? e.message : 'map init failed')
      return
    }
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    map.addControl(new ScaleControl({ unit: 'metric', maxWidth: 90 }), 'bottom-right')

    let basemapErrors = 0
    map.on('error', (e) => {
      const sourceId = (e as unknown as { sourceId?: string }).sourceId
      if (sourceId === 'radar') return // radar gaps are not a basemap failure
      basemapErrors += 1
      if (basemapErrors >= BASEMAP_ERROR_LIMIT) {
        setMapStatus({ state: 'degraded', detail: 'BASEMAP TILES FAILING' })
      }
    })

    // 'style.load' rather than 'load': 'load' waits for a first full render, which
    // never happens in a background tab (rAF paused) — overlays would be missing.
    map.once('style.load', () => {
      loaded.current = true
      map.addImage('wind-arrow', arrowImage(), { pixelRatio: 2 })
      const p = latest.current

      map.addSource('radar', {
        type: 'raster',
        tiles: radarTiles(p.radarTileUrl),
        tileSize: 256,
        minzoom: 4,
        maxzoom: 10,
        attribution: RADAR_ATTRIBUTION,
      })
      map.addLayer({
        id: 'radar',
        type: 'raster',
        source: 'radar',
        paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
      })

      map.addSource('rings', {
        type: 'geojson',
        data: ringsGeoJSON(p.center.lat, p.center.lon, p.rings),
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

      map.addSource('wind', { type: 'geojson', data: windGeoJSON(p.wind) })
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

      map.addSource('stations', { type: 'geojson', data: stationsGeoJSON(p.stations) })
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
        if (id) latest.current.onFocus(String(id))
      })
      map.on('mouseleave', 'stations', () => {
        map.getCanvas().style.cursor = ''
      })

      markerRef.current = new Marker({ element: crosshairElement() })
        .setLngLat([p.center.lon, p.center.lat])
        .addTo(map)

      // The location may have changed (e.g. GPS fix) while the style was loading.
      map.fitBounds(circleBounds(p.center.lat, p.center.lon, p.rangeKm), {
        padding: 12,
        duration: 0,
      })
      if (p.focusId)
        map.setFeatureState({ source: 'stations', id: Number(p.focusId) }, { focus: true })
      applyVisibility(map, p.layers)
      setMapStatus({ state: 'online' })
    })

    return () => {
      loaded.current = false
      markerRef.current = null
      mapRef.current = null
      map.remove()
      setMapStatus({ state: 'standby' })
    }
    // Created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Updates ──────────────────────────────────────────────────────────────
  const { center, rangeKm, rings, stations, wind, radarTileUrl, layers, focusId, recenterToken } =
    props

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    ;(map.getSource('rings') as GeoJSONSource | undefined)?.setData(
      ringsGeoJSON(center.lat, center.lon, rings),
    )
    markerRef.current?.setLngLat([center.lon, center.lat])
    map.fitBounds(circleBounds(center.lat, center.lon, rangeKm), { padding: 12, duration: 0 })
  }, [center.lat, center.lon, rangeKm, rings, recenterToken])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    ;(map.getSource('stations') as GeoJSONSource | undefined)?.setData(stationsGeoJSON(stations))
  }, [stations])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    ;(map.getSource('wind') as GeoJSONSource | undefined)?.setData(windGeoJSON(wind))
  }, [wind])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current || !radarTileUrl) return
    ;(map.getSource('radar') as RasterTileSource | undefined)?.setTiles(radarTiles(radarTileUrl))
  }, [radarTileUrl])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    applyVisibility(map, layers)
  }, [layers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    map.removeFeatureState({ source: 'stations' })
    if (focusId) map.setFeatureState({ source: 'stations', id: Number(focusId) }, { focus: true })
  }, [focusId, stations])

  return <div ref={container} className={s.map} role="presentation" />
}

function applyVisibility(map: MapLibreMap, layers: MapLayers) {
  const set = (id: string, on: boolean) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
  }
  set('radar', layers.echo)
  set('stations', layers.stn)
  set('station-labels', layers.stn)
  set('wind', layers.wind)
  set('rings', layers.grid)
  set('ring-labels', layers.grid)
}
