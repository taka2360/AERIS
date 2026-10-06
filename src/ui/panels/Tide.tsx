/**
 * O-01 — Tide at the nearest sea cell: sea level (tides included) from the
 * Open-Meteo Marine model, with high and low waters read off the hourly
 * series. MODEL values on a coarse grid, not JMA's tide tables.
 */
import { memo, useMemo } from 'react'
import { epoch, formatHour, formatTime, minutesBetween } from '@/domain/time'
import { tideAt, tideTurns } from '@/domain/tide'
import { useMinuteClock } from '@/query/clock'
import { useMarine } from '@/query/earth-hooks'
import { Panel } from '../primitives/Panel'
import { QualityTags } from '../primitives/primitives'
import s from './Tide.module.css'

/** Chart window around now, hours */
const BEFORE_H = 12
const AFTER_H = 30

function countdown(min: number): string {
  const m = Math.max(0, Math.round(min))
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

export const Tide = memo(function Tide() {
  const marine = useMarine()
  const now = useMinuteClock()
  const series = marine.data?.data.series

  const points = useMemo(
    () => (series?.points ?? []).map((p) => ({ time: p.time, level: p.values.sea_level ?? null })),
    [series],
  )
  const turns = useMemo(() => tideTurns(points), [points])
  const at = tideAt(points, now)

  const t0 = epoch(now) - BEFORE_H * 3_600_000
  const t1 = epoch(now) + AFTER_H * 3_600_000
  const shown = points.filter(
    (p): p is { time: string; level: number } =>
      p.level != null && epoch(p.time) >= t0 && epoch(p.time) <= t1,
  )
  const levels = shown.map((p) => p.level)
  const lo = Math.min(...levels)
  const hi = Math.max(...levels)
  const span = hi - lo || 1
  const x = (t: string) => ((epoch(t) - t0) / (t1 - t0)) * 100
  const y = (v: number) => 88 - ((v - lo) / span) * 70
  const path = shown.map((p) => `${x(p.time) * 10},${y(p.level)}`).join(' ')
  const visibleTurns = turns.filter((t) => epoch(t.time) >= t0 && epoch(t.time) <= t1)
  const nextHigh = turns.find((t) => t.kind === 'high' && t.time > now)
  const nextLow = turns.find((t) => t.kind === 'low' && t.time > now)
  const cellKm = marine.data?.data.cellDistanceKm

  return (
    <Panel
      code="O-01"
      title="TIDE"
      bodyClassName={s.body}
      meta={<QualityTags provenance={series?.provenance} />}
    >
      {!at || shown.length < 6 ? (
        <div className={s.pending}>
          {marine.isError
            ? '■ MARINE MODEL UNAVAILABLE'
            : marine.data
              ? '○ 海面高のデータなし(内陸の地点など)'
              : '◐ ACQUIRING MARINE MODEL…'}
        </div>
      ) : (
        <>
          <div className={s.now}>
            <div className={s.level}>
              <b>
                {at.level >= 0 ? '+' : ''}
                {at.level.toFixed(2)}
              </b>
              <span>m</span>
            </div>
            <div className={s.trend} data-trend={at.trend}>
              {at.trend === 'rising' ? '▲ 上げ潮' : at.trend === 'falling' ? '▼ 下げ潮' : '■ 停潮'}
            </div>
          </div>

          <div className={s.chart} aria-hidden="true">
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
              <polygon
                className={s.fill}
                points={`${x(shown[0]!.time) * 10},100 ${path} ${x(shown.at(-1)!.time) * 10},100`}
              />
              <polyline className={s.line} points={path} />
            </svg>
            <div className={s.nowLine} style={{ left: `${x(now)}%` }}>
              <span>NOW</span>
            </div>
            {visibleTurns.map((t) => (
              <span
                key={t.time}
                className={s.turn}
                data-kind={t.kind}
                style={{ left: `${x(t.time)}%`, top: `${y(t.level)}%` }}
              >
                <em>{formatTime(t.time, false)}</em>
              </span>
            ))}
            {shown
              .filter((p) => formatHour(p.time) === '00')
              .map((p) => (
                <span key={p.time} className={s.midnight} style={{ left: `${x(p.time)}%` }} />
              ))}
          </div>

          <dl className={s.rows}>
            <dt>次の満潮</dt>
            <dd>
              {nextHigh ? (
                <>
                  <b>{formatTime(nextHigh.time, false)}</b> · {nextHigh.level.toFixed(2)} m ·{' '}
                  <span className={s.dim}>
                    あと {countdown(minutesBetween(now, nextHigh.time))}
                  </span>
                </>
              ) : (
                '--'
              )}
            </dd>
            <dt>次の干潮</dt>
            <dd>
              {nextLow ? (
                <>
                  <b>{formatTime(nextLow.time, false)}</b> · {nextLow.level.toFixed(2)} m ·{' '}
                  <span className={s.dim}>あと {countdown(minutesBetween(now, nextLow.time))}</span>
                </>
              ) : (
                '--'
              )}
            </dd>
          </dl>
          <p className={`${s.note} ja`}>
            海面高(潮汐を含む)のモデル値 · 平均海面基準 · 最寄り格子点まで {cellKm ?? '--'} km。
            気象庁の潮位表ではありません。
          </p>
        </>
      )}
    </Panel>
  )
})
