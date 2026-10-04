import { memo } from 'react'
import { formatShortDate, formatTime } from '@/domain/time'
import { useOfficialForecast, useResolvedLocation } from '@/query/hooks'
import { Panel } from '../primitives/Panel'
import s from './OfficialForecast.module.css'

export const OfficialForecast = memo(function OfficialForecast() {
  const q = useOfficialForecast()
  const { location, query: loc } = useResolvedLocation()
  const noArea = loc.isSuccess && !location.jma
  const f = q.data?.data
  const issued = f?.provenance.issuedAt
  return (
    <Panel
      code="F-01"
      title="JMA OFFICIAL FORECAST"
      meta={
        issued ? (
          <span>
            ISSUED {formatShortDate(issued)} {formatTime(issued, false)}
          </span>
        ) : undefined
      }
    >
      {f ? (
        <dl className={s.list}>
          <div>
            <dt>AREA</dt>
            <dd className="ja">{f.areaName}</dd>
          </div>
          <div>
            <dt>WX</dt>
            <dd className={`${s.wx} ja`}>{f.weather}</dd>
          </div>
          {f.wind && (
            <div>
              <dt>WIND</dt>
              <dd className="ja">{f.wind}</dd>
            </div>
          )}
          {f.wave && (
            <div>
              <dt>WAVE</dt>
              <dd className="ja">{f.wave}</dd>
            </div>
          )}
        </dl>
      ) : (
        <div className={s.pending}>
          {noArea
            ? '○ NO JMA FORECAST AREA FOR THIS POINT'
            : q.isError || q.failureCount > 0
              ? '■ FORECAST TEXT UNAVAILABLE'
              : '◐ LINKING…'}
        </div>
      )}
    </Panel>
  )
})
