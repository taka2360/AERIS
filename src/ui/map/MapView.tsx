/**
 * MapLibre view — loaded lazily (own chunk). The map instance is created once;
 * overlays come from the layer registry and update only when the scene slice
 * they depend on changes. Failure to create a WebGL context or repeated
 * basemap tile errors are reported upward so the panel can show the outage
 * while the rest of the terminal keeps working.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Map as MapLibreMap, Marker, ScaleControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { setMapStatus } from '@/query/map-status'
import type { ViewBounds } from '@/domain/wind-lattice'
import { circleBounds } from './geo'
import { LeaderPopup } from './LeaderPopup'
import { JMA_ATTRIBUTION } from './layers/base-layers'
import { depsChanged, MAP_LAYERS, OVERLAY_SOURCES } from './layers/registry'
import type { LayerVisibility, MapScene } from './layers/types'
import { buildBaseStyle } from './style'
import s from './MapView.module.css'

setWorkerUrl(workerUrl)

export type { LayerVisibility as MapLayers, MapScene } from './layers/types'

/** Spatial range of the view. */
export type MapRange = 'local' | 'region' | 'globe'
/** 3D: globe projection (the Earth curves away). 2D: flat Web Mercator. Both top-down. */
export type MapProjection = '3d' | '2d'

/** Japan and its surrounding seas, [[w, s], [e, n]]. */
export const REGION_BOUNDS: [[number, number], [number, number]] = [
  [122, 23],
  [150, 46.5],
]

/** A popup pinned to a map position by a leader line. */
export type MapPopup = { key: string; at: [number, number]; label: string; content: ReactNode }

export type MapViewProps = {
  scene: MapScene
  layers: LayerVisibility
  range: MapRange
  projection: MapProjection
  onSelect: (eventId: string, at: [number, number]) => void
  /** A click that hit no selectable feature, at [lon, lat] */
  onBackgroundClick: (at: [number, number]) => void
  /** Visible bounds and zoom: while moving (throttled), after each move and once ready */
  onView: (view: ViewBounds) => void
  onFailure: (reason: string) => void
  recenterToken: number
  popup: MapPopup | null
}

const BASEMAP_ERROR_LIMIT = 8

function crosshairElement(): HTMLElement {
  const el = document.createElement('div')
  el.className = s.crosshair!
  el.setAttribute('aria-hidden', 'true')
  return el
}

function frameView(map: MapLibreMap, range: MapRange, projection: MapProjection, scene: MapScene) {
  const { lat, lon } = scene.center
  const is3d = projection === '3d'
  map.setProjection({ type: is3d ? 'globe' : 'mercator' })
  // Rotation (right-drag, two-finger, Shift+arrows) is 3D-only; the camera never tilts.
  if (is3d) {
    map.dragRotate.enable()
    map.touchZoomRotate.enableRotation()
    map.keyboard.enableRotation()
  } else {
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
  }
  const c = map.getContainer()
  const w = c.clientWidth || 400
  const h = c.clientHeight || 400
  if (range === 'globe') {
    // 3D: radius ≈ 42% of the shorter side (the world is 512·2^z px around at
    // zoom z, so radius = 512·2^z / 2π). 2D: the whole world across the width.
    const zoom = is3d ? Math.log2((0.42 * Math.min(w, h) * 2 * Math.PI) / 512) : Math.log2(w / 512)
    map.jumpTo({
      center: [lon, is3d ? lat : 20],
      zoom: Math.max(0, Math.min(2.6, zoom)),
      pitch: 0,
      bearing: 0,
    })
    return
  }
  const bounds = range === 'local' ? circleBounds(lat, lon, scene.rangeKm) : REGION_BOUNDS
  map.fitBounds(bounds, {
    padding: 12,
    duration: 0,
    bearing: 0,
    pitch: 0,
  })
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
  const [mapObj, setMapObj] = useState<MapLibreMap | null>(null)
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
        touchPitch: false,
        // Always looking straight down, in 3D as in 2D.
        maxPitch: 0,
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
    setMapObj(map)
    map.touchZoomRotate.disableRotation()
    const reportView = () => {
      const b = map.getBounds()
      latest.current.onView({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
        zoom: map.getZoom(),
      })
    }
    // Throttled while moving so cached arrows fill newly exposed areas at once.
    let lastReport = 0
    map.on('move', () => {
      const t = performance.now()
      if (t - lastReport < 150) return
      lastReport = t
      reportView()
    })
    map.on('moveend', reportView)

    // Registered before any layer's own click handler, so it runs first: a click
    // that no layer claims (no onSelect in the same turn) is a background click.
    let picked = false
    map.on('click', (e) => {
      picked = false
      const at: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      setTimeout(() => {
        if (!picked) latest.current.onBackgroundClick(at)
      }, 0)
    })
    const onSelect = (id: string, at: [number, number]) => {
      picked = true
      latest.current.onSelect(id, at)
    }
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
      const handlers = () => ({ onSelect })
      for (const def of MAP_LAYERS) {
        def.add(map, p.scene, handlers)
        deps.set(def.id, def.deps(p.scene))
      }
      markerRef.current = new Marker({ element: crosshairElement() })
        .setLngLat([p.scene.center.lon, p.scene.center.lat])
        .addTo(map)
      // The location may have changed (e.g. GPS fix) while the style was loading.
      frameView(map, p.range, p.projection, p.scene)
      applyVisibility(map, p.layers)
      reportView()
      setMapStatus({ state: 'online' })
    })

    return () => {
      loaded.current = false
      markerRef.current = null
      mapRef.current = null
      setMapObj(null)
      deps.clear()
      map.remove()
      setMapStatus({ state: 'standby' })
    }
    // Created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Updates ──────────────────────────────────────────────────────────────
  const { scene, layers, range, projection, recenterToken } = props

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

  // Re-frame only when the range, view mode or RECENTER changes — not on data updates.
  const { lat, lon } = scene.center
  const rangeKm = scene.rangeKm
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    frameView(map, range, projection, latest.current.scene)
  }, [rangeKm, range, projection, recenterToken])

  // A new target moves the crosshair. LOCAL is drawn around the target, so it
  // follows; REGION / GLOBE keep their zoom and only pan when the target is out
  // of view (a point picked on the map never moves the view).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    markerRef.current?.setLngLat([lon, lat])
    if (latest.current.range === 'local')
      frameView(map, 'local', latest.current.projection, latest.current.scene)
    else if (!map.getBounds().contains([lon, lat])) map.easeTo({ center: [lon, lat] })
  }, [lat, lon])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    applyVisibility(map, layers)
  }, [layers])

  return (
    <div className={s.wrap}>
      <div ref={container} className={s.map} role="presentation" data-testid="map-canvas" />
      {mapObj && props.popup && (
        <LeaderPopup
          key={props.popup.key}
          map={mapObj}
          at={props.popup.at}
          label={props.popup.label}
        >
          {props.popup.content}
        </LeaderPopup>
      )}
    </div>
  )
}
