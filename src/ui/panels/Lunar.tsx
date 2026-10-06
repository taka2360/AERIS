/**
 * L-01 — The Moon over the monitoring location, computed locally (no data
 * source): phase drawn as seen from the northern hemisphere, age, illuminated
 * fraction, rise/set today, where it is now and the next full / new moon.
 */
import { memo, useMemo } from 'react'
import { moonIllumination, moonPhaseName, moonPosition, moonTimes, nextPhase } from '@/domain/astro'
import { compass16 } from '@/domain/derive'
import { formatShortDate, formatTime, minutesBetween, startOfHour } from '@/domain/time'
import { useMinuteClock } from '@/query/clock'
import { useResolvedLocation } from '@/query/hooks'
import { Panel } from '../primitives/Panel'
import s from './Lunar.module.css'

const R = 40

/**
 * Lit part of the disc: the bright limb (a half circle) closed by the
 * terminator (half an ellipse). Waxing is lit on the right as seen from Japan.
 */
function litPath(fraction: number, waxing: boolean): string {
  const rx = R * Math.abs(1 - 2 * fraction)
  const gibbous = fraction > 0.5
  const limb = waxing ? 1 : 0
  const term = waxing === gibbous ? 1 : 0
  return `M 50 ${50 - R} A ${R} ${R} 0 0 ${limb} 50 ${50 + R} A ${rx} ${R} 0 0 ${term} 50 ${50 - R} Z`
}

function MoonDisc({ fraction, waxing }: { fraction: number; waxing: boolean }) {
  return (
    <svg className={s.disc} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="moon-lit" cx="45%" cy="40%" r="65%">
          <stop offset="0%" style={{ stopColor: 'var(--text)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--text-dim)' }} />
        </radialGradient>
      </defs>
      <circle className={s.dark} cx={50} cy={50} r={R} />
      {fraction > 0.005 && <path d={litPath(fraction, waxing)} fill="url(#moon-lit)" />}
      <circle className={s.rim} cx={50} cy={50} r={R} />
    </svg>
  )
}

function days(now: string, t: string): string {
  const d = minutesBetween(now, t) / 1440
  return d < 1 ? `${Math.round(d * 24)}時間後` : `${d.toFixed(1)}日後`
}

export const Lunar = memo(function Lunar() {
  const now = useMinuteClock()
  const { location } = useResolvedLocation()
  const { lat, lon } = location

  const ill = moonIllumination(now)
  const name = moonPhaseName(ill.phase)
  const pos = moonPosition(now, lat, lon)
  // Rise/set and next phases change slowly: recompute per hour and place.
  const hour = startOfHour(now)
  const times = useMemo(() => moonTimes(hour, lat, lon), [hour, lat, lon])
  const nextFull = useMemo(() => nextPhase(hour, 0.5), [hour])
  const nextNew = useMemo(() => nextPhase(hour, 0), [hour])
  const up = pos.altitude > 0

  return (
    <Panel code="L-01" title="LUNAR" bodyClassName={s.body} meta={<span>COMPUTED</span>}>
      <div className={s.top}>
        <MoonDisc fraction={ill.fraction} waxing={ill.waxing} />
        <div className={s.phase}>
          <b className="ja">{name.ja}</b>
          <span className={s.code}>{name.code}</span>
          <div className={s.figs}>
            <span>
              <i>AGE</i>
              <b>{ill.age.toFixed(1)}</b>
            </span>
            <span>
              <i>ILLUM</i>
              <b>{Math.round(ill.fraction * 100)}%</b>
            </span>
          </div>
        </div>
      </div>
      <dl className={s.rows}>
        <dt>月の出</dt>
        <dd>{times.rise ? formatTime(times.rise, false) : '-- (なし)'}</dd>
        <dt>月の入り</dt>
        <dd>{times.set ? formatTime(times.set, false) : '-- (なし)'}</dd>
        <dt>現在</dt>
        <dd data-up={up || undefined}>
          {up ? '地平線上' : '地平線下'} · 高度 {pos.altitude.toFixed(0)}° · 方位{' '}
          {compass16(pos.azimuth)}
        </dd>
        <dt>次の満月</dt>
        <dd>
          {formatShortDate(nextFull)} {formatTime(nextFull, false)}{' '}
          <span className={s.dim}>{days(now, nextFull)}</span>
        </dd>
        <dt>次の新月</dt>
        <dd>
          {formatShortDate(nextNew)} {formatTime(nextNew, false)}{' '}
          <span className={s.dim}>{days(now, nextNew)}</span>
        </dd>
      </dl>
      <p className={`${s.note} ja`}>
        天文計算による値(監視地点の位置で計算)。数分程度の誤差があります。
      </p>
    </Panel>
  )
})
