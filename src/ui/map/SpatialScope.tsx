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
import { formatTime } from '@/domain/time'
import { useTimeCursor } from '@/query/time-cursor'
import { useNowcastFrames, useResolvedLocation, useStations, useWindField } from '@/query/hooks'
import { setMapStatus, useMapStatus } from '@/query/map-status'
import { fmt } from '../format'
import { Panel } from '../primitives/Panel'
import type { MapLayers, MapRange, MapScene } from './MapView'
import { RANGE_KM, RINGS, ScopeView } from './ScopeView'
import { legendColor, RADAR_PALETTE } from './style'
import { TimeScrubber, type ScrubSpan } from './TimeScrubber'
import s from './SpatialScope.module.css'

const MapView = lazy(() => import('./MapView'))

type Mode = 'map' | 'scope'
const MODE_KEY = 'aeris.scopeMode'
const RANGE_KEY = 'aeris.mapRange'
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

  const [mode, setMode] = useState<Mode>(() => load(MODE_KEY, ['map', 'scope'], 'map'))
  const [range, setRange] = useState<MapRange>(() =>
    load(RANGE_KEY, ['local', 'region', 'globe'], 'local'),
  )
  const [mapFailed, setMapFailed] = useState(false)
  const [layers, setLayers] = useState<MapLayers>({ stn: true, wind: true, echo: true, grid: true })
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
  const span = useMemo<ScrubSpan | null>(() => {
    const first = frames[0]
    const last = frames.at(-1)
    if (!first || !last) return null
    return {
      start: first.validTime,
      end: last.validTime,
      observedUntil: latestObserved(frames, last.validTime)?.validTime ?? first.validTime,
      stepMin: 5,
    }
  }, [frames])
  const [playing, setPlaying] = useState(false)

  // Playback steps the global cursor through the frame times, wrapping around.
  const { scrubTo } = cursor
  const cursorT = cursor.t
  useEffect(() => {
    if (!playing || frames.length === 0) return
    const id = setInterval(() => {
      const ms = Date.parse(cursorT)
      const next = frames.find((f) => Date.parse(f.validTime) > ms) ?? frames[0]!
      scrubTo(next.validTime)
    }, 650)
    return () => clearInterval(id)
  }, [playing, frames, cursorT, scrubTo])

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

  const scene = useMemo<MapScene>(
    () => ({
      center,
      rangeKm: RANGE_KM,
      rings: RINGS,
      stations: stationList,
      wind: windSamples,
      radarTileUrl: radarUrl,
      focusId: focused?.id ?? null,
    }),
    [center, stationList, windSamples, radarUrl, focused?.id],
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

  const layerLabel: Record<keyof MapLayers, string> = {
    echo: showMap ? 'RADAR' : 'PRECIP',
    stn: 'STN',
    wind: 'WIND',
    grid: showMap ? 'RINGS' : 'GRID',
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
          <div className={s.toggles} role="group" aria-label="表示レイヤー">
            {(Object.keys(layerLabel) as Array<keyof MapLayers>).map((id) => (
              <button
                key={id}
                type="button"
                className={s.toggle}
                aria-pressed={layers[id]}
                onClick={() => setLayers((v) => ({ ...v, [id]: !v[id] }))}
              >
                {layerLabel[id]}
              </button>
            ))}
          </div>
        </>
      }
    >
      <div className={s.main}>
        <div className={s.scopeWrap} data-mode={showMap ? 'map' : 'scope'}>
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
        {showMap && layers.echo && (
          <TimeScrubber
            cursor={cursor}
            span={span}
            shown={shown}
            label="RADAR"
            playing={playing}
            setPlaying={setPlaying}
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
