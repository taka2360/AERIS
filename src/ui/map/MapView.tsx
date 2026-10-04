/**
 * MapLibre view — loaded lazily (own chunk). The map instance is created once;
 * overlays come from the layer registry and update only when the scene slice
 * they depend on changes. Failure to create a WebGL context or repeated
 * basemap tile errors are reported upward so the panel can fall back to the
 * vector scope.
 */
import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, Marker, ScaleControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { setMapStatus } from '@/query/map-status'
import { circleBounds } from './geo'
import { JMA_ATTRIBUTION } from './layers/base-layers'
import { depsChanged, MAP_LAYERS, OVERLAY_SOURCES } from './layers/registry'
import type { LayerVisibility, MapScene } from './layers/types'
import { buildBaseStyle } from './style'
import s from './MapView.module.css'

setWorkerUrl(workerUrl)

export type { LayerVisibility as MapLayers, MapScene } from './layers/types'

/** Spatial range of the view. */
export type MapRange = 'local' | 'region' | 'globe'

/** Japan and its surrounding seas, [[w, s], [e, n]]. */
export const REGION_BOUNDS: [[number, number], [number, number]] = [
  [122, 23],
  [150, 46.5],
]

export type MapViewProps = {
  scene: MapScene
  layers: LayerVisibility
  range: MapRange
  onFocus: (id: string) => void
  onSelect: (eventId: string) => void
  onFailure: (reason: string) => void
  recenterToken: number
}

const BASEMAP_ERROR_LIMIT = 8

function crosshairElement(): HTMLElement {
  const el = document.createElement('div')
  el.className = s.crosshair!
  el.setAttribute('aria-hidden', 'true')
  return el
}

function frameView(map: MapLibreMap, range: MapRange, scene: MapScene) {
  const { lat, lon } = scene.center
  if (range === 'globe') {
    map.setProjection({ type: 'globe' })
    map.jumpTo({ center: [lon, lat], zoom: 1.4 })
    return
  }
  map.setProjection({ type: 'mercator' })
  const bounds = range === 'local' ? circleBounds(lat, lon, scene.rangeKm) : REGION_BOUNDS
  map.fitBounds(bounds, { padding: 12, duration: 0 })
}

function applyVisibility(map: MapLibreMap, layers: LayerVisibility) {
  for (const def of MAP_LAYERS)
    for (const id of def.styleLayers)
      if (map.getLayer(id))
        map.setLayoutProperty(id, 'visibility', layers[def.toggle] ? 'visible' : 'none')
}

export default function MapView(props: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const loaded = useRef(false)
  const lastDeps = useRef(new Map<string, unknown[]>())
  // Latest props for async map callbacks (load / hover), updated after each render.
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })

  // ── Create once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!container.current) return
    setMapStatus({ state: 'loading' })
    const deps = lastDeps.current
    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: container.current,
        style: buildBaseStyle(),
        bounds: circleBounds(props.scene.center.lat, props.scene.center.lon, props.scene.rangeKm),
        fitBoundsOptions: { padding: 12 },
        attributionControl: { compact: true, customAttribution: JMA_ATTRIBUTION },
        dragRotate: false,
        pitchWithRotate: false,
        maxZoom: 13,
        minZoom: 0,
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
      if (sourceId && OVERLAY_SOURCES.has(sourceId)) return // data gaps are not a basemap failure
      basemapErrors += 1
      if (basemapErrors >= BASEMAP_ERROR_LIMIT) {
        setMapStatus({ state: 'degraded', detail: 'BASEMAP TILES FAILING' })
      }
    })

    // 'style.load' rather than 'load': 'load' waits for a first full render, which
    // never happens in a background tab (rAF paused) — overlays would be missing.
    map.once('style.load', () => {
      loaded.current = true
      const p = latest.current
      const handlers = () => ({
        onFocus: latest.current.onFocus,
        onSelect: latest.current.onSelect,
      })
      for (const def of MAP_LAYERS) {
        def.add(map, p.scene, handlers)
        deps.set(def.id, def.deps(p.scene))
      }
      markerRef.current = new Marker({ element: crosshairElement() })
        .setLngLat([p.scene.center.lon, p.scene.center.lat])
        .addTo(map)
      // The location may have changed (e.g. GPS fix) while the style was loading.
      frameView(map, p.range, p.scene)
      applyVisibility(map, p.layers)
      setMapStatus({ state: 'online' })
    })

    return () => {
      loaded.current = false
      markerRef.current = null
      mapRef.current = null
      deps.clear()
      map.remove()
      setMapStatus({ state: 'standby' })
    }
    // Created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Updates ──────────────────────────────────────────────────────────────
  const { scene, layers, range, recenterToken } = props

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    for (const def of MAP_LAYERS) {
      const next = def.deps(scene)
      if (!depsChanged(lastDeps.current.get(def.id), next)) continue
      def.update(map, scene)
      lastDeps.current.set(def.id, next)
    }
  }, [scene])

  // Re-frame only when the target, range or view mode changes — not on data updates.
  const { lat, lon } = scene.center
  const rangeKm = scene.rangeKm
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    markerRef.current?.setLngLat([lon, lat])
    frameView(map, range, latest.current.scene)
  }, [lat, lon, rangeKm, range, recenterToken])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    applyVisibility(map, layers)
  }, [layers])

  return <div ref={container} className={s.map} role="presentation" />
}
