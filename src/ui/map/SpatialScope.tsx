/**
 * M-01 — Spatial scope panel.
 *  MAP   : MapLibre basemap + JMA radar nowcast + stations + wind (lazy chunk)
 *  SCOPE : vector azimuthal scope (no basemap / WebGL needed)
 * The map is one subsystem among others: if it fails, the panel falls back to
 * SCOPE and the system reports BASEMAP DEGRADED — weather monitoring continues.
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
import { frameAt, framesToIntervals, latestObserved } from '@/domain/earth/temporal'
import { addMinutes, formatTime } from '@/domain/time'
import { useTimeCursor } from '@/query/time-cursor'
import { useQuakeEvents } from '@/query/earth-hooks'
import { useSelection } from '@/query/selection'
import { activeWindow } from '@/domain/earth/temporal'
import { intensityLabel, intensityRank, quakeSeverity } from '@/domain/earth/derive'
import { DEFAULT_LAYERS, LAYER_CATALOG } from './layers/catalog'
import { LayerMenu } from './LayerMenu'
import { useNowcastFrames, useResolvedLocation, useStations, useWindField } from '@/query/hooks'
import { setMapStatus, useMapStatus } from '@/query/map-status'
import { fmt } from '../format'
import { Panel } from '../primitives/Panel'
import type { MapLayers, MapRange, MapScene } from './MapView'
import { RANGE_KM, RINGS, ScopeView } from './ScopeView'
import { legendColor, RADAR_PALETTE } from './style'
import { TimeScrubber, type ScrubSpan, type ScrubTick } from './TimeScrubber'
import s from './SpatialScope.module.css'

const MapView = lazy(() => import('./MapView'))

type Mode = 'map' | 'scope'
const MODE_KEY = 'aeris.scopeMode'
const RANGE_KEY = 'aeris.mapRange'
const LAYERS_KEY = 'aeris.layers'

/** Saved visibility merged over defaults (new layers appear with their default). */
function loadLayers(): MapLayers {
  try {
    const raw = window.localStorage.getItem(LAYERS_KEY)
    return { ...DEFAULT_LAYERS, ...(raw ? (JSON.parse(raw) as Partial<MapLayers>) : {}) }
  } catch {
    return DEFAULT_LAYERS
  }
}

/** Layers the vector scope can draw without a basemap. */
const SCOPE_LAYERS = new Set(['echo', 'stn', 'wind', 'grid'])
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

/** Catches a failed lazy chunk / map crash and hands control back to SCOPE. */
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
  const wind = useWindField()
  const nowcast = useNowcastFrames()
  const mapStatus = useMapStatus()
  const cursor = useTimeCursor()
  const { events: quakeEvents } = useQuakeEvents()
  const { selectedId, select } = useSelection()

  const [mode, setMode] = useState<Mode>(() => load(MODE_KEY, ['map', 'scope'], 'map'))
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

  const frames = useMemo(
    () =>
      framesToIntervals(
        (nowcast.data?.data ?? []).map((f) => ({
          ...f,
          role: f.kind === 'observation' ? ('observed' as const) : ('nowcast' as const),
        })),
      ),
    [nowcast.data],
  )
  // LIVE shows the latest observation; SCRUB shows only what was valid at t.
  const shown =
    cursor.mode === 'live' ? latestObserved(frames, cursor.now) : frameAt(frames, cursor.t)
  // The scrubber covers what the active layers can show: the radar's frames
  // and, with earthquakes on, the past 24 hours.
  const quakeSpan = layers.quake
  const span = useMemo<ScrubSpan | null>(() => {
    const first = frames[0]
    const last = frames.at(-1)
    const now = cursor.now
    if (!quakeSpan && (!first || !last)) return null
    const start = quakeSpan ? addMinutes(now, -24 * 60) : first!.validTime
    const end = last ? (last.validTime > now ? last.validTime : now) : now
    const observedUntil = last ? (latestObserved(frames, last.validTime)?.validTime ?? now) : now
    return {
      start: quakeSpan && first && first.validTime < start ? first.validTime : start,
      end,
      observedUntil,
      stepMin: 5,
    }
  }, [frames, quakeSpan, cursor.now])
  const ticks = useMemo<ScrubTick[]>(
    () =>
      quakeSpan
        ? quakeEvents
            .filter((e) => {
              const sev = quakeSeverity(e).value
              return sev !== 'none' && e.time.startedAt
            })
            .map((e) => ({
              t: e.time.startedAt!,
              tone: ['severe', 'extreme'].includes(quakeSeverity(e).value) ? 'alert' : 'event',
            }))
        : [],
    [quakeEvents, quakeSpan],
  )
  const [playing, setPlaying] = useState(false)

  // Playback steps the global cursor through radar frames (5 min) or, without
  // radar, through the span in 30-minute steps, wrapping around.
  const { scrubTo } = cursor
  const cursorT = cursor.t
  const radarOn = layers.echo && frames.length > 0
  useEffect(() => {
    if (!playing || !span) return
    const id = setInterval(() => {
      const ms = Date.parse(cursorT)
      if (radarOn) {
        const next = frames.find((f) => Date.parse(f.validTime) > ms) ?? frames[0]!
        scrubTo(next.validTime)
      } else {
        const next = addMinutes(cursorT, 30)
        scrubTo(next > span.end ? span.start : next)
      }
    }, 650)
    return () => clearInterval(id)
  }, [playing, frames, cursorT, scrubTo, radarOn, span])

  const showMap = mode === 'map' && !mapFailed && active
  useEffect(() => {
    if (!showMap && !mapFailed) setMapStatus({ state: 'standby' })
  }, [showMap, mapFailed])

  const stationList = useMemo(
    () => (stations.data?.data ?? []).filter((st) => st.distanceKm <= RANGE_KM),
    [stations.data],
  )
  const windSamples = useMemo(() => wind.data?.data ?? [], [wind.data])
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

  const scene = useMemo<MapScene>(
    () => ({
      center,
      rangeKm: RANGE_KM,
      rings: RINGS,
      stations: stationList,
      wind: windSamples,
      radarTileUrl: radarUrl,
      focusId: focused?.id ?? null,
      quakes,
      selectedEventId: selectedId,
      intensityStations,
    }),
    [
      center,
      stationList,
      windSamples,
      radarUrl,
      focused?.id,
      quakes,
      selectedId,
      intensityStations,
    ],
  )

  const changeMode = (m: Mode) => {
    setMode(m)
    if (m === 'map') setMapFailed(false)
    save(MODE_KEY, m)
  }
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

  return (
    <Panel
      code="M-01"
      title="SPATIAL SCOPE"
      bodyClassName={s.body}
      meta={
        <>
          <div className={s.toggles} role="group" aria-label="表示モード">
            {(['map', 'scope'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={s.toggle}
                data-mode
                aria-pressed={mode === m}
                onClick={() => changeMode(m)}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          {mode === 'map' && (
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
          )}
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
        <div className={s.scopeWrap} data-mode={showMap ? 'map' : 'scope'}>
          <LayerMenu
            layers={layers}
            setLayers={setLayers}
            open={menuOpen}
            setOpen={setMenuOpen}
            available={(e) => showMap || SCOPE_LAYERS.has(e.id)}
          />
          {showMap ? (
            <MapBoundary onError={onMapFailure}>
              <Suspense
                fallback={<div className={s.mapLoading}>◐ LOADING CARTOGRAPHIC ENGINE…</div>}
              >
                <MapView
                  scene={scene}
                  layers={layers}
                  range={range}
                  onFocus={setFocus}
                  onSelect={select}
                  onFailure={onMapFailure}
                  recenterToken={recenter}
                />
              </Suspense>
            </MapBoundary>
          ) : (
            <ScopeView
              center={center}
              stations={stationList}
              wind={windSamples}
              layers={layers}
              focusId={focused?.id ?? null}
              onFocus={setFocus}
            />
          )}

          <div className={s.overlayTL} aria-hidden="true">
            <div>CTR {formatCoord(location.lat, location.lon)}</div>
            <div>
              {showMap
                ? RANGES.find((r) => r.id === range)!.caption
                : `RNG ${RANGE_KM}KM · AZIMUTHAL`}
            </div>
            {mapFailed && mode === 'map' && (
              <div className={s.warn}>▲ BASEMAP UNAVAILABLE — VECTOR SCOPE</div>
            )}
          </div>
          <div className={s.overlayBL} aria-hidden="true">
            <div>OBS {obsTime ? `${formatTime(obsTime, false)} JST` : '--:--'}</div>
            <div>
              STN {String(stationList.length).padStart(2, '0')} ·{' '}
              {showMap ? 'ECHO SRC: JMA NOWCAST' : 'PRECIP AMeDAS 1H'}
            </div>
          </div>
          {showMap ? (
            <div className={s.legend} aria-hidden="true">
              {RADAR_PALETTE.slice(1).map((c) => (
                <span key={c.min}>
                  <i style={{ background: legendColor(c.rgba) }} />
                  {c.min}+
                </span>
              ))}
              <span className={s.legendUnit}>mm/h</span>
            </div>
          ) : (
            <div className={s.legend} aria-hidden="true">
              <span>
                <i style={{ background: 'var(--cyan-dim)' }} />
                &lt;3
              </span>
              <span>
                <i style={{ background: 'var(--cyan)' }} />
                3+
              </span>
              <span>
                <i style={{ background: 'var(--yellow)' }} />
                10+
              </span>
              <span>
                <i style={{ background: 'var(--red)' }} />
                30+ mm/h
              </span>
            </div>
          )}
          {showMap && (
            <button type="button" className={s.recenter} onClick={() => setRecenter((n) => n + 1)}>
              ⌖ RECENTER
            </button>
          )}
        </div>
        {showMap && (layers.echo || layers.quake) && (
          <TimeScrubber
            cursor={cursor}
            span={span}
            shown={shown}
            label="RADAR"
            playing={playing}
            setPlaying={setPlaying}
            ticks={ticks}
          />
        )}
      </div>

      <div className={s.side}>
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
                  <small>{st.windDirection != null ? ` ${compass16(st.windDirection)}` : ''}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(stations.isError || stations.failureCount > 0) && (
          <div className={s.err}>■ OBS NETWORK UNAVAILABLE</div>
        )}
      </div>
    </Panel>
  )
})
