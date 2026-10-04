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
import type { NowcastFrame } from '@/domain/model'
import { formatTime, minutesBetween } from '@/domain/time'
import { useMinuteClock } from '@/query/clock'
import { useNowcastFrames, useResolvedLocation, useStations, useWindField } from '@/query/hooks'
import { setMapStatus, useMapStatus } from '@/query/map-status'
import { fmt } from '../format'
import { Panel } from '../primitives/Panel'
import type { MapLayers, MapRange, MapScene } from './MapView'
import { RANGE_KM, RINGS, ScopeView } from './ScopeView'
import { legendColor, RADAR_PALETTE } from './style'
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

function RadarBar({
  frames,
  index,
  setIndex,
  playing,
  setPlaying,
  now,
}: {
  frames: NowcastFrame[]
  index: number
  setIndex: (i: number) => void
  playing: boolean
  setPlaying: (v: boolean) => void
  now: string
}) {
  const f = frames[index]
  if (!f) return <div className={s.radarBar}>RADAR · NO FRAMES</div>
  const offset = Math.round(minutesBetween(now, f.validTime) / 5) * 5
  return (
    <div className={s.radarBar}>
      <button
        type="button"
        className={s.play}
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? 'レーダー再生を停止' : 'レーダーを再生'}
        aria-pressed={playing}
      >
        {playing ? '■' : '▶'}
      </button>
      <span className={s.radarTime} data-kind={f.kind}>
        {formatTime(f.validTime, false)}
      </span>
      <span className={s.radarKind} data-kind={f.kind}>
        {f.kind === 'observation' ? 'OBS' : 'FCST'} {offset >= 0 ? '+' : '−'}
        {Math.abs(offset)}M
      </span>
      <input
        type="range"
        className={s.slider}
        min={0}
        max={frames.length - 1}
        value={index}
        onChange={(e) => {
          setPlaying(false)
          setIndex(Number(e.target.value))
        }}
        aria-label="レーダー時刻"
        aria-valuetext={`${formatTime(f.validTime, false)} ${f.kind === 'observation' ? '実況' : '予測'}`}
        style={{
          ['--obs' as string]: `${(frames.filter((x) => x.kind === 'observation').length / frames.length) * 100}%`,
        }}
      />
    </div>
  )
}

export const SpatialScope = memo(function SpatialScope({ active = true }: { active?: boolean }) {
  const { location } = useResolvedLocation()
  const stations = useStations()
  const wind = useWindField()
  const nowcast = useNowcastFrames()
  const mapStatus = useMapStatus()
  const now = useMinuteClock()

  const [mode, setMode] = useState<Mode>(() => load(MODE_KEY, ['map', 'scope'], 'map'))
  const [range, setRange] = useState<MapRange>(() =>
    load(RANGE_KEY, ['local', 'region', 'globe'], 'local'),
  )
  const [mapFailed, setMapFailed] = useState(false)
  const [layers, setLayers] = useState<MapLayers>({ stn: true, wind: true, echo: true, grid: true })
  const [focus, setFocus] = useState<string | null>(null)
  const [recenter, setRecenter] = useState(0)

  const frames = useMemo(() => nowcast.data?.data ?? [], [nowcast.data])
  const latestObs = Math.max(
    0,
    frames.findLastIndex((f) => f.kind === 'observation'),
  )
  // A user-picked frame belongs to one frame list; a new list resets to the latest observation.
  const listKey = nowcast.dataUpdatedAt
  const [picked, setPickedRaw] = useState<{ key: number; index: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const pickedIndex = picked?.key === listKey ? picked.index : null
  const frameIndex = Math.min(pickedIndex ?? latestObs, Math.max(0, frames.length - 1))
  const setPicked = (index: number) => setPickedRaw({ key: listKey, index })

  // Play only while requested; the interval exists only during playback.
  useEffect(() => {
    if (!playing || frames.length === 0) return
    const id = setInterval(() => {
      setPickedRaw((p) => {
        const cur = p?.key === listKey ? p.index : latestObs
        return { key: listKey, index: (cur + 1) % frames.length }
      })
    }, 650)
    return () => clearInterval(id)
  }, [playing, frames.length, latestObs, listKey])

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
  const radarUrl = frames[frameIndex]?.tileUrlTemplate ?? null

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
          <RadarBar
            frames={frames}
            index={frameIndex}
            setIndex={setPicked}
            playing={playing}
            setPlaying={setPlaying}
            now={now}
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
