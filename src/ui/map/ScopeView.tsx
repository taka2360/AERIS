/**
 * Vector scope: a local azimuthal plot centred on the target. Needs no basemap
 * or WebGL — it is both a display mode and the fallback when the map fails.
 */
import { memo } from 'react'
import type { StationObservation, WindSample } from '@/domain/model'
import type { MapLayers } from './MapView'
import s from './SpatialScope.module.css'

export const RANGE_KM = 45
export const RINGS = [10, 20, 40]

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

export const ScopeView = memo(function ScopeView({
  center,
  stations,
  wind,
  layers,
  focusId,
  onFocus,
}: {
  center: { lat: number; lon: number }
  stations: StationObservation[]
  wind: WindSample[]
  layers: MapLayers
  focusId: string | null
  onFocus: (id: string) => void
}) {
  const proj = project(center.lat, center.lon)
  return (
    <svg
      className={s.scope}
      viewBox={`${-RANGE_KM - 4} ${-RANGE_KM - 4} ${(RANGE_KM + 4) * 2} ${(RANGE_KM + 4) * 2}`}
      role="img"
      aria-label={`観測スコープ: 半径${RANGE_KM}km、観測点${stations.length}地点`}
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
      {layers.echo && (
        <g>
          {stations
            .filter((st) => (st.precipitation1h ?? 0) > 0.2)
            .map((st) => {
              const p = proj(st.lat, st.lon)
              return (
                <circle
                  key={st.id}
                  cx={p.x}
                  cy={p.y}
                  r={3 + Math.sqrt(st.precipitation1h ?? 0) * 3}
                  fill={echoColor(st.precipitation1h ?? 0)}
                  className={s.echo}
                />
              )
            })}
        </g>
      )}
      {layers.wind && (
        <g className={s.wind}>
          {wind.map((w, i) => {
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
      )}
      {layers.stn && (
        <g>
          {stations.map((st) => {
            const p = proj(st.lat, st.lon)
            return (
              <g
                key={st.id}
                transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
                className={s.station}
                data-active={focusId === st.id || undefined}
                onPointerEnter={() => onFocus(st.id)}
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
      <g className={s.cross}>
        <line x1="-5" x2="-1.5" y1="0" y2="0" />
        <line x1="1.5" x2="5" y1="0" y2="0" />
        <line y1="-5" y2="-1.5" x1="0" x2="0" />
        <line y1="1.5" y2="5" x1="0" x2="0" />
        <circle r="0.6" />
      </g>
    </svg>
  )
})
