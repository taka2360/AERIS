/**
 * M-01 — Spatial scope panel: MapLibre basemap + JMA radar nowcast + wind and
 * event overlays (lazy chunk), with the nearest AMeDAS stations alongside.
 * The map is one subsystem among others: if it fails, the panel says so and
 * the system reports BASEMAP DEGRADED — weather monitoring continues.
 * Clicking an event on the map opens a popup tied to it by a leader line.
 */
import {
  Component,
  lazy,
  memo,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { compass16, formatCoord } from '@/domain/derive'
import { frameAt, framesToIntervals } from '@/domain/earth/temporal'
import type { RasterFrame } from '@/domain/earth/fields'
import { addMinutes, formatTime, minutesBetween, toInstant } from '@/domain/time'
import { useTimeCursor } from '@/query/time-cursor'
import {
  useCyclones,
  useQuakeEvents,
  useStrokes,
  useThunder,
  useTsunami,
  useVolcanoes,
  useKikikuru,
  useMarineGrid,
  useSnow,
  useAurora,
  useFirms,
  useGlobalEvents,
  useGdacsLinks,
} from '@/query/earth-hooks'
import { cyclonePositionAt } from '@/domain/earth/temporal'
import { activeTsunami } from '@/domain/earth/status'
import { useSelection } from '@/query/selection'
import { activeWindow } from '@/domain/earth/temporal'
import { intensityLabel, intensityRank, quakeSeverity } from '@/domain/earth/derive'
import { DEFAULT_LAYERS, LAYER_CATALOG } from './layers/catalog'
import { LayerMenu } from './LayerMenu'
import { useNowcastFrames, useResolvedLocation, useStations } from '@/query/hooks'
import { useViewportWind } from '@/query/viewport-wind'
import type { ViewBounds } from '@/domain/wind-lattice'
import { setMapStatus, useMapStatus } from '@/query/map-status'
import { fmt } from '../format'
import { Panel } from '../primitives/Panel'
import type { MapLayers, MapPopup, MapRange, MapScene } from './MapView'
import { NearestExtras } from './NearestExtras'
import { EventPopup } from '../panels/EventPopup'
import { legendColor, TILE_PALETTES } from './style'
import { TimeScrubber, type ScrubSpan, type ScrubTick } from './TimeScrubber'
import { CATEGORY_TAG } from '../panels/event-format'
import s from './SpatialScope.module.css'

const MapView = lazy(() => import('./MapView'))

/** Radius of the LOCAL view and of the nearest-station list, km */
const RANGE_KM = 45
const RINGS = [10, 20, 40]
/**
 * NEAREST is a local readout: it slides in when the view is zoomed in to about
 * the LOCAL range and out when zoomed away. Two thresholds (hysteresis) keep
 * it from flickering while the zoom hovers around one value.
 */
const SIDE_SHOW_ZOOM = 7.5
const SIDE_HIDE_ZOOM = 6.8
const RANGE_KEY = 'aeris.mapRange'
const LAYERS_KEY = 'aeris.layers'

/** Saved visibility merged over defaults (new layers appear with their default). */
function loadLayers(): MapLayers {
  try {
    const raw = window.localStorage.getItem(LAYERS_KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<MapLayers>) : {}
    // Keep only known toggles (removed layers may linger in old saves).
    const known = Object.fromEntries(
      Object.entries(saved).filter(([k]) => k in DEFAULT_LAYERS),
    ) as Partial<MapLayers>
    return { ...DEFAULT_LAYERS, ...known }
  } catch {
    return DEFAULT_LAYERS
  }
}

const RANGES: Array<{ id: MapRange; label: string; caption: string }> = [
  { id: 'local', label: 'LOCAL', caption: `RNG ${RANGE_KM}KM · WEB MERCATOR` },
  { id: 'region', label: 'REGION', caption: 'RNG JAPAN · WEB MERCATOR' },
  { id: 'globe', label: 'GLOBE', caption: 'RNG EARTH · GLOBE' },
]

function load<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = window.localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

type ScopeFrame = {
  validTime: string
  validFrom: string
  validUntil: string
  role: 'observed' | 'analysis' | 'nowcast' | 'forecast'
  tileUrlTemplate: string
}

/** Raster field frames with a representative time (interval midpoint). */
function toScopeFrames(frames: RasterFrame[] | undefined): ScopeFrame[] {
  return (frames ?? []).map((f) => ({
    ...f,
    validTime: toInstant((Date.parse(f.validFrom) + Date.parse(f.validUntil)) / 2),
  }))
}

/** Newest observed/analysed frame at or before now — never a forecast frame. */
function liveFrame(frames: ScopeFrame[], now: string): ScopeFrame | null {
  let best: ScopeFrame | null = null
  for (const f of frames)
    if ((f.role === 'observed' || f.role === 'analysis') && f.validTime <= now)
      if (!best || f.validTime > best.validTime) best = f
  return best
}

/** Catches a failed lazy chunk / map crash and reports it to the panel. */
class MapBoundary extends Component<
  { onError: (msg: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    this.props.onError(error.message)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export const SpatialScope = memo(function SpatialScope({ active = true }: { active?: boolean }) {
  const { location } = useResolvedLocation()
  const stations = useStations()
  const nowcast = useNowcastFrames()
  const mapStatus = useMapStatus()
  const cursor = useTimeCursor()
  const { events: quakeEvents } = useQuakeEvents()
  const tsunami = useTsunami()
  const { events: cycloneEvents } = useCyclones()
  const volc = useVolcanoes()
  const { selectedId, select } = useSelection()

  const [range, setRange] = useState<MapRange>(() =>
    load(RANGE_KEY, ['local', 'region', 'globe'], 'local'),
  )
  const [mapFailed, setMapFailed] = useState(false)
  const [layers, setLayersRaw] = useState<MapLayers>(loadLayers)
  const [menuOpen, setMenuOpen] = useState(false)
  const setLayers = (v: MapLayers) => {
    setLayersRaw(v)
    save(LAYERS_KEY, JSON.stringify(v))
  }
  const [focus, setFocus] = useState<string | null>(null)
  const [recenter, setRecenter] = useState(0)
  const [view, setView] = useState<ViewBounds | null>(null)
  const [sideOpen, setSideOpen] = useState(range === 'local')
  const onView = (v: ViewBounds) => {
    setView(v)
    setSideOpen((open) =>
      v.zoom >= SIDE_SHOW_ZOOM ? true : v.zoom < SIDE_HIDE_ZOOM ? false : open,
    )
  }
  const [popup, setPopup] = useState<{ id: string; at: [number, number] } | null>(null)

  const thunder = useThunder()
  const strokeData = useStrokes()
  const frames = useMemo<ScopeFrame[]>(
    () =>
      framesToIntervals(
        (nowcast.data?.data ?? []).map((f) => ({
          ...f,
          role: f.kind === 'observation' ? ('observed' as const) : ('nowcast' as const),
        })),
      ),
    [nowcast.data],
  )
  const ltngFrames = useMemo(() => toScopeFrames(thunder.data?.lightning.frames), [thunder.data])
  const tornFrames = useMemo(() => toScopeFrames(thunder.data?.tornado.frames), [thunder.data])
  const kiki = useKikikuru()
  const landFrames = useMemo(() => toScopeFrames(kiki.data?.land.frames), [kiki.data])
  const inundFrames = useMemo(() => toScopeFrames(kiki.data?.inundation.frames), [kiki.data])
  const floodFrames = useMemo(() => toScopeFrames(kiki.data?.flood.frames), [kiki.data])
  const snow = useSnow()
  const snowdFrames = useMemo(() => toScopeFrames(snow.data?.depth.frames), [snow.data])
  const snowfFrames = useMemo(() => toScopeFrames(snow.data?.snowfall.frames), [snow.data])
  // LIVE shows the newest observation/analysis; SCRUB shows only what was valid at t.
  const pick = (fs: ScopeFrame[]) =>
    cursor.mode === 'live' ? liveFrame(fs, cursor.now) : frameAt(fs, cursor.t)
  const shown = pick(frames)
  const ltngShown = pick(ltngFrames)
  const tornShown = pick(tornFrames)
  const landShown = pick(landFrames)
  const inundShown = pick(inundFrames)
  const floodShown = pick(floodFrames)
  const snowdShown = pick(snowdFrames)
  const snowfShown = pick(snowfFrames)

  // The scrubber covers what the active layers can show: raster frames,
  // the past hour of strokes and, with earthquakes on, the past 24 hours.
  const stepFrames = useMemo(
    () =>
      layers.echo
        ? frames
        : layers.ltng || layers.torn
          ? ltngFrames
          : layers.land || layers.inund || layers.flood
            ? landFrames
            : layers.snowd || layers.snowf
              ? snowdFrames
              : [],
    [
      layers.echo,
      layers.ltng,
      layers.torn,
      layers.land,
      layers.inund,
      layers.flood,
      frames,
      ltngFrames,
      landFrames,
      layers.snowd,
      layers.snowf,
      snowdFrames,
    ],
  )
  const quakeSpan = layers.quake
  const span = useMemo<ScrubSpan | null>(() => {
    const now = cursor.now
    const parts: Array<[string, string]> = []
    if (stepFrames.length) parts.push([stepFrames[0]!.validTime, stepFrames.at(-1)!.validTime])
    if (layers.strk) parts.push([addMinutes(now, -60), now])
    if (quakeSpan) parts.push([addMinutes(now, -24 * 60), now])
    if (parts.length === 0) return null
    const start = parts.map((p) => p[0]).sort()[0]!
    const end = [...parts.map((p) => p[1]), now].sort().at(-1)!
    const observedUntil = liveFrame(stepFrames, now)?.validTime ?? now
    return { start, end, observedUntil, stepMin: 5 }
  }, [stepFrames, quakeSpan, layers.strk, cursor.now])
  const ticks = useMemo<ScrubTick[]>(
    () =>
      quakeSpan
        ? quakeEvents
            .filter((e) => quakeSeverity(e).value !== 'none' && e.time.startedAt)
            .map((e) => ({
              t: e.time.startedAt!,
              tone: ['severe', 'extreme'].includes(quakeSeverity(e).value) ? 'alert' : 'event',
            }))
        : [],
    [quakeEvents, quakeSpan],
  )
  const [playing, setPlaying] = useState(false)
  // Legend and scrubber follow the raster field on display (one at a time).
  const legend = layers.ltng
    ? { colors: TILE_PALETTES.thunder, unit: '雷活動度', scrubLabel: 'THUNDER' }
    : layers.land || layers.inund
      ? { colors: TILE_PALETTES.kikikuru.slice(1), unit: 'キキクル', scrubLabel: 'KIKIKURU' }
      : layers.snowd
        ? { colors: TILE_PALETTES.snow, unit: 'cm', scrubLabel: 'SNOW' }
        : layers.snowf
          ? { colors: TILE_PALETTES.snowfall, unit: 'cm/3h', scrubLabel: 'SNOW' }
          : {
              colors: TILE_PALETTES.precip.slice(1),
              unit: 'mm/h',
              scrubLabel: layers.echo ? 'RADAR' : 'EVENTS',
            }

  // Playback steps the global cursor through the active raster's frames or,
  // without one, through the span in 30-minute steps, wrapping around.
  const { scrubTo } = cursor
  const cursorT = cursor.t
  useEffect(() => {
    if (!playing || !span) return
    const id = setInterval(() => {
      const ms = Date.parse(cursorT)
      if (stepFrames.length) {
        const next = stepFrames.find((f) => Date.parse(f.validTime) > ms) ?? stepFrames[0]!
        scrubTo(next.validTime)
      } else {
        const next = addMinutes(cursorT, 30)
        scrubTo(next > span.end ? span.start : next)
      }
    }, 650)
    return () => clearInterval(id)
  }, [playing, stepFrames, cursorT, scrubTo, span])

  const strokes = useMemo(
    () =>
      activeWindow(strokeData.data?.data.strokes ?? [], (k) => k.windowEnd, cursor.t, 60).map(
        ({ item, age }) => ({ lat: item.lat, lon: item.lon, cg: item.kind === 'cg', age }),
      ),
    [strokeData.data, cursor.t],
  )

  const showMap = !mapFailed && active
  // Without a map there is nothing to zoom: the station readout stays.
  const showSide = !showMap || sideOpen
  useEffect(() => {
    if (!showMap && !mapFailed) setMapStatus({ state: 'standby' })
  }, [showMap, mapFailed])
  const windSamples = useViewportWind(view, showMap && layers.wind)
  // A selection made elsewhere (log, monitor, CLEAR) closes the map popup.
  const popupOpen = popup && popup.id === selectedId ? popup : null

  const stationList = useMemo(
    () => (stations.data?.data ?? []).filter((st) => st.distanceKm <= RANGE_KM),
    [stations.data],
  )
  const center = useMemo(
    () => ({ lat: location.lat, lon: location.lon }),
    [location.lat, location.lon],
  )
  const focused = stationList.find((st) => st.id === focus) ?? stationList[0]
  const obsTime = stationList[0]?.observedAt
  const radarUrl = shown?.tileUrlTemplate ?? null

  // Earthquakes as of the cursor time, fading out over 24 hours.
  const quakes = useMemo(
    () =>
      activeWindow(quakeEvents, (e) => e.time.startedAt, cursor.t, 24 * 60).map(
        ({ item: e, age }) => {
          const mags = e.measures
            .filter((m) => m.kind === 'earthquake.magnitude')
            .map((m) => m.value)
          const sev = quakeSeverity(e).value
          return {
            id: e.id,
            lat: e.detail.hypocenter.lat,
            lon: e.detail.hypocenter.lon,
            magnitude: mags.length ? Math.max(...mags) : null,
            age,
            severe: sev === 'severe' || sev === 'extreme',
          }
        },
      ),
    [quakeEvents, cursor.t],
  )
  const intensityStations = useMemo(() => {
    const sel = quakeEvents.find((e) => e.id === selectedId)
    return (sel?.detail.stations ?? []).map((st) => ({
      lat: st.lat,
      lon: st.lon,
      rank: intensityRank(st.intensity),
      label: intensityLabel(st.intensity),
    }))
  }, [quakeEvents, selectedId])

  // Highest class per forecast area among assessments valid at the cursor time.
  const tsunamiCoasts = useMemo(() => {
    const lines = tsunami.areas.data
    if (!lines) return []
    const byArea = new Map<string, number>()
    for (const a of activeTsunami(tsunami.assessments, cursor.t))
      if (a.area.code) byArea.set(a.area.code, Math.max(byArea.get(a.area.code) ?? 0, a.rank))
    return [...byArea]
      .filter(([code]) => lines[code])
      .map(([code, rank]) => ({ code, rank, lines: lines[code]! }))
  }, [tsunami.areas.data, tsunami.assessments, cursor.t])

  // Cyclone centres: the analysis in LIVE; when scrubbing, the stated position
  // at t (forecast interpolated within one issuance), or nothing.
  const cyclones = useMemo(
    () =>
      cycloneEvents.map((e) => {
        const d = e.detail
        const pos =
          cursor.mode === 'live'
            ? (d.observedPosition ?? null)
            : cyclonePositionAt(
                d.observedTrack.concat(d.observedPosition ? [d.observedPosition] : []),
                d.forecasts,
                cursor.t,
              )
        const hpa = d.observedPosition?.pressureHpa
        return {
          id: e.id,
          label: `${e.title.replace(/^台風/, 'TY ')}${hpa ? ` ${hpa}hPa` : ''}`,
          path: d.observedPath ?? [],
          points: d.forecasts.at(-1)?.points ?? [],
          coneLines: d.coneLines ?? [],
          stormLines: d.stormLines ?? [],
          gale: d.galeArea,
          at: pos ? { lat: pos.lat, lon: pos.lon, role: pos.role } : null,
        }
      }),
    [cycloneEvents, cursor.mode, cursor.t],
  )

  // Every monitored volcano; listed bulletins colour it. Quiet volcanoes select
  // their catalogue entry ('volcano-site:<code>').
  const volcanoes = useMemo(() => {
    const byCode = new Map(volc.events.map((e) => [e.detail.volcanoCode, e]))
    // Only bulletins already issued at the cursor time colour a volcano.
    const rank = new Map(
      volc.assessments
        .filter((a) => !a.time.issuedAt || a.time.issuedAt <= cursor.t)
        .map((a) => [a.area.code, a.rank]),
    )
    return volc.sites.map((v) => {
      const e = byCode.get(v.code)
      const name = e?.detail.levelName ?? ''
      return {
        selectId: e?.id ?? `volcano-site:${v.code}`,
        name: v.name,
        lat: v.lat,
        lon: v.lon,
        rank: rank.get(v.code) ?? 0,
        levelShort: name.replace(/（.*）/, ''),
      }
    })
  }, [volc.events, volc.assessments, volc.sites, cursor.t])

  // The wave grid is a single model analysis: shown only near its own time.
  const marineGrid = useMarineGrid(layers.wave)
  const marineCells = useMemo(() => {
    const g = marineGrid.data?.data
    if (!g || Math.abs(minutesBetween(g.at, cursor.t)) > 90) return []
    return g.cells
  }, [marineGrid.data, cursor.t])

  // OVATION is a short-range forecast: shown only near its valid time.
  const aurora = useAurora(layers.aurora)
  const auroraCells = useMemo(() => {
    const g = aurora.data?.data
    if (!g || Math.abs(minutesBetween(g.forecastFor, cursor.t)) > 90) return []
    return g.cells
  }, [aurora.data, cursor.t])

  // Fires: detections up to the cursor time, fading over 24 h.
  const firms = useFirms()
  const fireDetections = useMemo(
    () =>
      activeWindow(firms.data?.data.detections ?? [], (d) => d.detectedAt, cursor.t, 24 * 60).map(
        ({ item, age }) => ({ lat: item.lat, lon: item.lon, frp: item.frpMw, age }),
      ),
    [firms.data, cursor.t],
  )
  // Global markers: events started by the cursor time, coloured by linked GDACS level.
  const { events: globalEvents } = useGlobalEvents()
  const links = useGdacsLinks(globalEvents)
  const globalMarkers = useMemo(
    () =>
      globalEvents
        .filter((e) => e.geometry.type === 'Point')
        .filter((e) => !e.time.startedAt || e.time.startedAt <= cursor.t)
        .map((e) => {
          const [lon, lat] = (e.geometry as { coordinates: [number, number] }).coordinates
          return {
            id: e.id,
            lat,
            lon,
            tag: CATEGORY_TAG[e.category],
            rank: Math.max(0, ...(links.get(e.id) ?? []).map((a) => a.rank)),
          }
        }),
    [globalEvents, links, cursor.t],
  )

  const scene = useMemo<MapScene>(
    () => ({
      center,
      rangeKm: RANGE_KM,
      rings: RINGS,
      wind: windSamples,
      radarTileUrl: radarUrl,
      lightningTileUrl: ltngShown?.tileUrlTemplate ?? null,
      tornadoTileUrl: tornShown?.tileUrlTemplate ?? null,
      landTileUrl: landShown?.tileUrlTemplate ?? null,
      inundTileUrl: inundShown?.tileUrlTemplate ?? null,
      floodTileUrl: floodShown?.tileUrlTemplate ?? null,
      snowDepthTileUrl: snowdShown?.tileUrlTemplate ?? null,
      snowfallTileUrl: snowfShown?.tileUrlTemplate ?? null,
      marineCells,
      auroraCells,
      fireDetections,
      globalMarkers,
      strokes,
      quakes,
      selectedEventId: selectedId,
      intensityStations,
      tsunamiCoasts,
      cyclones,
      volcanoes,
    }),
    [
      center,
      windSamples,
      radarUrl,
      ltngShown?.tileUrlTemplate,
      tornShown?.tileUrlTemplate,
      landShown?.tileUrlTemplate,
      inundShown?.tileUrlTemplate,
      floodShown?.tileUrlTemplate,
      snowdShown?.tileUrlTemplate,
      snowfShown?.tileUrlTemplate,
      marineCells,
      auroraCells,
      fireDetections,
      globalMarkers,
      strokes,
      quakes,
      selectedId,
      intensityStations,
      tsunamiCoasts,
      cyclones,
      volcanoes,
    ],
  )

  const changeRange = (r: MapRange) => {
    setRange(r)
    save(RANGE_KEY, r)
  }
  const onMapFailure = (msg: string) => {
    setMapFailed(true)
    setMapStatus({
      state: mapStatus.state === 'unsupported' ? 'unsupported' : 'degraded',
      detail: msg.slice(0, 40),
    })
  }

  const mapPopup = useMemo<MapPopup | null>(
    () =>
      popupOpen
        ? {
            key: popupOpen.id,
            at: popupOpen.at,
            content: (
              <EventPopup id={popupOpen.id} at={popupOpen.at} onClose={() => setPopup(null)} />
            ),
          }
        : null,
    [popupOpen],
  )
  useEffect(() => {
    if (!popupOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPopup(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popupOpen])
  const onMapSelect = (id: string, at: [number, number]) => {
    select(id)
    setPopup({ id, at })
  }

  return (
    <Panel
      code="M-01"
      title="SPATIAL SCOPE"
      className={s.panel}
      bodyClassName={showSide ? s.body : `${s.body} ${s.sideClosed}`}
      meta={
        <>
          <div className={s.toggles} role="group" aria-label="表示範囲">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={s.toggle}
                data-mode
                aria-pressed={range === r.id}
                onClick={() => changeRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={s.toggle}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            LAYERS {String(LAYER_CATALOG.filter((e) => layers[e.id]).length).padStart(2, '0')}
          </button>
        </>
      }
    >
      <div className={s.main}>
        <div className={s.scopeWrap} data-mode="map">
          <LayerMenu layers={layers} setLayers={setLayers} open={menuOpen} setOpen={setMenuOpen} />
          {showMap ? (
            <MapBoundary onError={onMapFailure}>
              <Suspense
                fallback={<div className={s.mapLoading}>◐ LOADING CARTOGRAPHIC ENGINE…</div>}
              >
                <MapView
                  scene={scene}
                  layers={layers}
                  range={range}
                  onSelect={onMapSelect}
                  onBackgroundClick={() => setPopup(null)}
                  onView={onView}
                  onFailure={onMapFailure}
                  recenterToken={recenter}
                  popup={mapPopup}
                />
              </Suspense>
            </MapBoundary>
          ) : mapFailed ? (
            <div className={s.mapDown} role="status">
              <b>▲ BASEMAP UNAVAILABLE</b>
              <span className="ja">
                地図を表示できません(WebGL または地図タイルの障害)。他の監視は継続しています。
              </span>
              <button type="button" className={s.toggle} onClick={() => setMapFailed(false)}>
                RETRY
              </button>
            </div>
          ) : null}

          <div className={s.overlayTL} aria-hidden="true">
            <div>CTR {formatCoord(location.lat, location.lon)}</div>
            <div>{RANGES.find((r) => r.id === range)!.caption}</div>
          </div>
          <div className={s.overlayBL} aria-hidden="true">
            <div>OBS {obsTime ? `${formatTime(obsTime, false)} JST` : '--:--'}</div>
            <div>ECHO SRC: JMA NOWCAST</div>
          </div>
          {showMap && (
            <div className={s.legend} aria-hidden="true">
              {legend.colors.map((c) => (
                <span key={c.label}>
                  <i style={{ background: legendColor(c.rgba) }} />
                  {c.label}
                </span>
              ))}
              <span className={s.legendUnit}>{legend.unit}</span>
            </div>
          )}
          {showMap && (
            <button type="button" className={s.recenter} onClick={() => setRecenter((n) => n + 1)}>
              ⌖ RECENTER
            </button>
          )}
        </div>
        {showMap && span && (
          <TimeScrubber
            cursor={cursor}
            span={span}
            shown={layers.echo ? shown : layers.ltng || layers.torn ? ltngShown : null}
            label={legend.scrubLabel}
            playing={playing}
            setPlaying={setPlaying}
            ticks={ticks}
          />
        )}
      </div>

      {/* Kept mounted so it can slide in and out; inert while closed. */}
      <div className={s.side} inert={!showSide}>
        <div className={s.sideInner}>
          <div className={s.sideHead}>OBS NETWORK · NEAREST</div>
          <table className={s.stnTable}>
            <caption className="visually-hidden">近傍のアメダス観測点</caption>
            <thead>
              <tr>
                <th scope="col">STN</th>
                <th scope="col">KM</th>
                <th scope="col">°C</th>
                <th scope="col">MM</th>
                <th scope="col">WIND</th>
              </tr>
            </thead>
            <tbody>
              {stationList.slice(0, 12).map((st) => (
                <tr
                  key={st.id}
                  data-active={focused?.id === st.id || undefined}
                  onPointerEnter={() => setFocus(st.id)}
                  tabIndex={0}
                  onFocus={() => setFocus(st.id)}
                >
                  <th scope="row" className="ja">
                    {st.name}
                  </th>
                  <td>{st.distanceKm.toFixed(1)}</td>
                  <td>{fmt(st.temperature)}</td>
                  <td data-wet={(st.precipitation1h ?? 0) > 0 || undefined}>
                    {fmt(st.precipitation1h)}
                  </td>
                  <td>
                    {fmt(st.windSpeed)}
                    <small>
                      {st.windDirection != null ? ` ${compass16(st.windDirection)}` : ''}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(stations.isError || stations.failureCount > 0) && (
            <div className={s.err}>■ OBS NETWORK UNAVAILABLE</div>
          )}
          <NearestExtras stations={stationList} focused={focused} />
        </div>
      </div>
    </Panel>
  )
})
