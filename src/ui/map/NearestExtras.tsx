/**
 * Below the nearest-station table: the focused station in full (hover a row
 * to change it) and the spread across the local network — where it is
 * warmest, wettest and windiest right now. All values are AMeDAS OBS.
 */
import { compass16 } from '@/domain/derive'
import type { StationObservation } from '@/domain/model'
import { formatTime } from '@/domain/time'
import { fmt } from '../format'
import s from './SpatialScope.module.css'

function maxBy(list: StationObservation[], key: (s: StationObservation) => number | null) {
  let best: StationObservation | null = null
  for (const st of list) {
    const v = key(st)
    if (v != null && (best == null || v > (key(best) ?? -Infinity))) best = st
  }
  return best
}

/** Temperature strip: one tick per station between the network min and max. */
function TempStrip({
  stations,
  focusId,
}: {
  stations: StationObservation[]
  focusId: string | undefined
}) {
  const temps = stations.filter((st) => st.temperature != null)
  if (temps.length < 2) return null
  const vs = temps.map((st) => st.temperature!)
  const lo = Math.min(...vs)
  const hi = Math.max(...vs)
  const span = Math.max(0.1, hi - lo)
  return (
    <div className={s.strip}>
      <span className={s.stripEnd}>{lo.toFixed(1)}</span>
      <span className={s.stripTrack} aria-hidden="true">
        {temps.map((st) => (
          <i
            key={st.id}
            data-focus={st.id === focusId || undefined}
            style={{ left: `${((st.temperature! - lo) / span) * 100}%` }}
          />
        ))}
      </span>
      <span className={s.stripEnd}>{hi.toFixed(1)}°C</span>
    </div>
  )
}

export function NearestExtras({
  stations,
  focused,
}: {
  stations: StationObservation[]
  focused: StationObservation | undefined
}) {
  if (stations.length === 0) return null
  const warm = maxBy(stations, (st) => st.temperature)
  const cold = maxBy(stations, (st) => (st.temperature == null ? null : -st.temperature))
  const wet = maxBy(stations, (st) => st.precipitation1h)
  const windy = maxBy(stations, (st) => st.gust ?? st.windSpeed)
  const raining = stations.filter((st) => (st.precipitation1h ?? 0) > 0).length

  return (
    <div className={s.extras}>
      {focused && (
        <section className={s.focusCard} aria-label="選択中の観測点">
          <div className={s.sideHead}>
            FOCUS · <span className="ja">{focused.name}</span>
          </div>
          <div className={s.focusMain}>
            <span className={s.focusTemp}>
              {fmt(focused.temperature)}
              <small>°C</small>
            </span>
            <span className={s.focusWind}>
              <span
                className={s.windArrow}
                aria-hidden="true"
                style={{ transform: `rotate(${(focused.windDirection ?? 0) + 180}deg)` }}
                data-calm={focused.windDirection == null || undefined}
              >
                ↑
              </span>
              {fmt(focused.windSpeed)}
              <small>
                m/s{focused.windDirection != null ? ` ${compass16(focused.windDirection)}` : ''}
              </small>
            </span>
          </div>
          <dl className={s.focusGrid}>
            <dt>HUMID</dt>
            <dd>{focused.humidity == null ? '--' : `${focused.humidity}%`}</dd>
            <dt>PRESS</dt>
            <dd>{focused.pressure == null ? '--' : focused.pressure.toFixed(1)}</dd>
            <dt>GUST</dt>
            <dd>{focused.gust == null ? '--' : `${focused.gust.toFixed(1)}`}</dd>
            <dt>RAIN</dt>
            <dd>{fmt(focused.precipitation1h)} mm</dd>
            <dt>SUN</dt>
            <dd>{focused.sunshine1h == null ? '--' : `${focused.sunshine1h} min`}</dd>
            <dt>DIST</dt>
            <dd>{focused.distanceKm.toFixed(1)} km</dd>
          </dl>
          <div className={s.focusFoot}>
            OBS {formatTime(focused.observedAt, false)} JST · AMeDAS #{focused.id}
          </div>
        </section>
      )}

      <section className={s.netCard} aria-label="観測網の概況">
        <div className={s.sideHead}>NETWORK · {stations.length} STN</div>
        <TempStrip stations={stations} focusId={focused?.id} />
        <dl className={s.netGrid}>
          <dt>WARMEST</dt>
          <dd>
            <span className="ja">{warm?.name ?? '--'}</span>
            <b>{fmt(warm?.temperature ?? null)}°</b>
          </dd>
          <dt>COOLEST</dt>
          <dd>
            <span className="ja">{cold?.name ?? '--'}</span>
            <b>{fmt(cold?.temperature ?? null)}°</b>
          </dd>
          <dt>WETTEST</dt>
          <dd>
            <span className="ja">{(wet?.precipitation1h ?? 0) > 0 ? wet!.name : '降水なし'}</span>
            <b data-wet={(wet?.precipitation1h ?? 0) > 0 || undefined}>
              {(wet?.precipitation1h ?? 0) > 0 ? `${fmt(wet!.precipitation1h)}mm` : ''}
            </b>
          </dd>
          <dt>WINDIEST</dt>
          <dd>
            <span className="ja">{windy?.name ?? '--'}</span>
            <b>{fmt(windy?.gust ?? windy?.windSpeed ?? null)}m/s</b>
          </dd>
          <dt>RAINING</dt>
          <dd>
            <span>
              {raining} / {stations.length} STN
            </span>
          </dd>
        </dl>
      </section>
    </div>
  )
}
