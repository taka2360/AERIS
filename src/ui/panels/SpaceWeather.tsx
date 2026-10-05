/**
 * S-03 — Space weather. Each value states its kind: solar wind, IMF and
 * X-ray are L1 / GOES observations, the 1-minute Kp is an estimate, G/S/R
 * are NOAA's assessment and their predictions are forecasts.
 */
import { memo } from 'react'
import { SYSTEM_STATUS_LABEL } from '@/domain/earth/derive'
import { spaceStatus } from '@/domain/earth/status'
import { formatShortDate, formatTime } from '@/domain/time'
import { useSpaceWeather } from '@/query/earth-hooks'
import { Panel } from '../primitives/Panel'
import { DataStateBadge } from '../primitives/primitives'
import { Sparkline } from './Environment'
import s from './SpaceWeather.module.css'

const G_TEXT = ['none', 'minor', 'moderate', 'strong', 'severe', 'extreme']

function Tag({ kind }: { kind: 'OBS' | 'EST' | 'ASSESSMENT' | 'FCST' }) {
  return (
    <span className={s.tag} data-kind={kind}>
      {kind}
    </span>
  )
}

export const SpaceWeather = memo(function SpaceWeather() {
  const q = useSpaceWeather()
  const sw = q.data?.data
  const reading = spaceStatus(sw ?? null, !!sw)
  const geomagnetic =
    (sw?.kp.estimated ?? 0) >= 5 ? 'STORM' : (sw?.kp.estimated ?? 0) >= 4 ? 'ELEVATED' : 'QUIET'

  return (
    <Panel
      code="S-03"
      title="SPACE WEATHER"
      tone={reading.status === 'warning' || reading.status === 'critical' ? 'alert' : 'default'}
      meta={<span>NOAA SWPC</span>}
    >
      {!sw ? (
        q.isError ? (
          <DataStateBadge state="unavailable" />
        ) : (
          <span className={s.dim}>◐ LINKING…</span>
        )
      ) : (
        <div className={s.body}>
          <div className={s.status} data-status={reading.status}>
            <span className={s.label}>STATUS</span>
            <b>{SYSTEM_STATUS_LABEL[reading.status]}</b>
            {q.data?.provenance.decode === 'partial' && <DataStateBadge state="partial" />}
          </div>
          <dl className={s.grid}>
            <dt>SOLAR WIND</dt>
            <dd>
              <b>{sw.solarWind.speed != null ? Math.round(sw.solarWind.speed) : '--'}</b> km/s
              <Tag kind="OBS" />
            </dd>
            <dt>IMF Bt / Bz</dt>
            <dd>
              <b>{sw.solarWind.bt ?? '--'}</b> /{' '}
              <b data-south={(sw.solarWind.bz ?? 0) < 0 || undefined}>{sw.solarWind.bz ?? '--'}</b>{' '}
              nT
              <Tag kind="OBS" />
            </dd>
            <dt>KP INDEX</dt>
            <dd>
              <b>{sw.kp.estimated != null ? sw.kp.estimated.toFixed(1) : '--'}</b>
              <Tag kind="EST" />
              <span className={s.dim}>3h {sw.kp.series.at(-1)?.kp.toFixed(1) ?? '--'}</span>
            </dd>
            <dt>GEOMAGNETIC</dt>
            <dd>
              <b data-geo={geomagnetic}>{geomagnetic}</b>
            </dd>
            <dt>X-RAY</dt>
            <dd>
              <b>{sw.xray.current ?? '--'}</b>
              <Tag kind="OBS" />
              {sw.xray.maxClass && (
                <span className={s.dim}>
                  max {sw.xray.maxClass}
                  {sw.xray.maxAt ? ` ${formatTime(sw.xray.maxAt, false)}` : ''}
                </span>
              )}
            </dd>
            <dt>NOAA SCALES</dt>
            <dd>
              <b>G{sw.scales.current.G}</b> <b>S{sw.scales.current.S}</b>{' '}
              <b>R{sw.scales.current.R}</b>
              <Tag kind="ASSESSMENT" />
              <span className={s.dim}>{G_TEXT[sw.scales.current.G]}</span>
            </dd>
          </dl>
          {sw.windSeries.length > 1 && (
            <div className={s.spark}>
              <span className={s.label}>SOLAR WIND · PAST HOUR (L1, propagated)</span>
              <Sparkline
                values={sw.windSeries.map((p) => p.speed)}
                split={sw.windSeries.length - 1}
              />
            </div>
          )}
          {sw.scales.predicted.length > 0 && (
            <div className={s.pred}>
              <span className={s.label}>PREDICTED</span>
              {sw.scales.predicted.map((p) => (
                <span key={p.date}>
                  {formatShortDate(`${p.date}T00:00:00+09:00`)} G{p.G ?? '-'} · R1+{' '}
                  {p.rMinorProb ?? '-'}%
                </span>
              ))}
              <Tag kind="FCST" />
            </div>
          )}
          {sw.alerts.slice(0, 3).map((a) => (
            <p key={a.id} className={s.alert}>
              {formatTime(a.issuedAt, false)} {a.kind}: {a.title}
            </p>
          ))}
        </div>
      )}
    </Panel>
  )
})
