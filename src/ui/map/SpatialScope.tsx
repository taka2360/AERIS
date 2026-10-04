/**
 * M-01 — Spatial scope. A local azimuthal plot centred on the target:
 * range rings, AMeDAS stations, model wind vectors and precipitation echoes.
 * Works with no basemap at all; the MapLibre layer (step 7) sits beneath it
 * and this vector view remains the fallback when tiles are unavailable.
 */
import { memo, useMemo, useState } from 'react'
import { compass16, formatCoord } from '@/domain/derive'
import type { StationObservation, WindSample } from '@/domain/model'
import { formatTime } from '@/domain/time'
import { useResolvedLocation, useStations, useWindField } from '@/query/hooks'
import { fmt } from '../format'
import { Panel } from '../primitives/Panel'
import s from './SpatialScope.module.css'

const RANGE_KM = 45
const RINGS = [10, 20, 40]

type Layer = 'stn' | 'wind' | 'echo' | 'grid'
const LAYERS: Array<{ id: Layer; label: string }> = [
  { id: 'echo', label: 'ECHO' },
  { id: 'stn', label: 'STN' },
  { id: 'wind', label: 'WIND' },
  { id: 'grid', label: 'GRID' },
]

function project(lat0: number, lon0: number) {
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180)
  return (lat: number, lon: number) => ({ x: (lon - lon0) * kx, y: -(lat - lat0) * 111.32 })
}

function echoColor(mm: number): string {
  if (mm >= 30) return 'var(--red)'
  if (mm >= 10) return 'var(--yellow)'
  if (mm >= 3) return 'var(--cyan)'
  return 'var(--cyan-dim)'
}

const Echoes = memo(function Echoes({
  stations,
  proj,
}: {
  stations: StationObservation[]
  proj: ReturnType<typeof project>
}) {
  return (
    <g className={s.echoes}>
      {stations
        .filter((st) => (st.precipitation1h ?? 0) > 0.2)
        .map((st) => {
          const p = proj(st.lat, st.lon)
          const r = 3 + Math.sqrt(st.precipitation1h ?? 0) * 3
          return (
            <circle
              key={st.id}
              cx={p.x}
              cy={p.y}
              r={r}
              fill={echoColor(st.precipitation1h ?? 0)}
              className={s.echo}
            />
          )
        })}
    </g>
  )
})

const WindVectors = memo(function WindVectors({
  samples,
  proj,
}: {
  samples: WindSample[]
  proj: ReturnType<typeof project>
}) {
  return (
    <g className={s.wind}>
      {samples.map((w, i) => {
        const p = proj(w.lat, w.lon)
        if (Math.hypot(p.x, p.y) > RANGE_KM) return null
        const len = 2 + Math.min(w.speed, 15) * 0.45
        return (
          <g
            key={i}
            transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${w.direction + 180})`}
          >
            <line x1="0" y1={len / 2} x2="0" y2={-len / 2} />
            <path d={`M0 ${-len / 2 - 1.2} L1 ${-len / 2 + 0.6} L-1 ${-len / 2 + 0.6} Z`} />
          </g>
        )
      })}
    </g>
  )
})

export const SpatialScope = memo(function SpatialScope() {
  const { location } = useResolvedLocation()
  const stations = useStations()
  const wind = useWindField()
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    stn: true,
    wind: true,
    echo: true,
    grid: true,
  })
  const [focus, setFocus] = useState<string | null>(null)

  const proj = useMemo(() => project(location.lat, location.lon), [location.lat, location.lon])
  const stationList = useMemo(
    () => (stations.data?.data ?? []).filter((st) => st.distanceKm <= RANGE_KM),
    [stations.data],
  )
  const focused = stationList.find((st) => st.id === focus) ?? stationList[0]
  const obsTime = stationList[0]?.observedAt

  return (
    <Panel
      code="M-01"
      title="SPATIAL SCOPE"
      bodyClassName={s.body}
      meta={
        <div className={s.toggles} role="group" aria-label="表示レイヤー">
          {LAYERS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={s.toggle}
              aria-pressed={layers[l.id]}
              onClick={() => setLayers((v) => ({ ...v, [l.id]: !v[l.id] }))}
            >
              {l.label}
            </button>
          ))}
        </div>
      }
    >
      <div className={s.scopeWrap}>
        <svg
          className={s.scope}
          viewBox={`${-RANGE_KM - 4} ${-RANGE_KM - 4} ${(RANGE_KM + 4) * 2} ${(RANGE_KM + 4) * 2}`}
          role="img"
          aria-label={`観測スコープ: 半径${RANGE_KM}km、観測点${stationList.length}地点`}
        >
          <defs>
            <radialGradient id="scope-bg">
              <stop offset="0%" stopColor="rgba(255,176,0,0.07)" />
              <stop offset="100%" stopColor="rgba(255,176,0,0)" />
            </radialGradient>
          </defs>
          <circle r={RANGE_KM} fill="url(#scope-bg)" />
          {layers.grid && (
            <g className={s.grid}>
              {Array.from({ length: 9 }, (_, i) => (i - 4) * 10).map((v) => (
                <g key={v}>
                  <line x1={v} x2={v} y1={-RANGE_KM} y2={RANGE_KM} />
                  <line y1={v} y2={v} x1={-RANGE_KM} x2={RANGE_KM} />
                </g>
              ))}
            </g>
          )}
          <g className={s.rings}>
            {RINGS.map((r) => (
              <g key={r}>
                <circle r={r} />
                <text x={r * 0.71 + 0.8} y={-r * 0.71 - 0.8} className={s.ringLabel}>
                  {r}KM
                </text>
              </g>
            ))}
            <circle r={RANGE_KM} className={s.outer} />
            {Array.from({ length: 72 }, (_, i) => (
              <line
                key={i}
                x1="0"
                x2="0"
                y1={-RANGE_KM}
                y2={-RANGE_KM + (i % 6 === 0 ? 2.4 : 1)}
                transform={`rotate(${i * 5})`}
                className={s.bezel}
              />
            ))}
            {['N', 'E', 'S', 'W'].map((d, i) => (
              <text
                key={d}
                transform={`rotate(${i * 90}) translate(0 ${-RANGE_KM - 1.6})`}
                className={s.cardinal}
              >
                {d}
              </text>
            ))}
          </g>
          {layers.echo && <Echoes stations={stationList} proj={proj} />}
          {layers.wind && wind.data && <WindVectors samples={wind.data.data} proj={proj} />}
          {layers.stn && (
            <g className={s.stations}>
              {stationList.map((st) => {
                const p = proj(st.lat, st.lon)
                const active = focused?.id === st.id
                return (
                  <g
                    key={st.id}
                    transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
                    className={s.station}
                    data-active={active || undefined}
                    onPointerEnter={() => setFocus(st.id)}
                  >
                    <rect x="-1.1" y="-1.1" width="2.2" height="2.2" />
                    {st.temperature != null && (
                      <text x="2" y="0.9" className={s.stnTemp}>
                        {st.temperature.toFixed(1)}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )}
          {/* Target crosshair */}
          <g className={s.cross}>
            <line x1="-5" x2="-1.5" y1="0" y2="0" />
            <line x1="1.5" x2="5" y1="0" y2="0" />
            <line y1="-5" y2="-1.5" x1="0" x2="0" />
            <line y1="1.5" y2="5" x1="0" x2="0" />
            <circle r="0.6" />
          </g>
        </svg>

        <div className={s.overlayTL} aria-hidden="true">
          <div>CTR {formatCoord(location.lat, location.lon)}</div>
          <div>RNG {RANGE_KM}KM · AZIMUTHAL</div>
        </div>
        <div className={s.overlayBL} aria-hidden="true">
          <div>OBS {obsTime ? `${formatTime(obsTime, false)} JST` : '--:--'}</div>
          <div>STN {String(stationList.length).padStart(2, '0')} · ECHO SRC: AMeDAS 1H</div>
        </div>
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
