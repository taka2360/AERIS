import { memo } from 'react'
import { CONDITION_LABEL, compass16 } from '@/domain/derive'
import { dateKeyToInstant, formatShortDate, formatWeekday } from '@/domain/time'
import { useForecast } from '@/query/hooks'
import { fmt } from '../format'
import { Panel } from '../primitives/Panel'
import s from './DailyForecast.module.css'

export const DailyForecast = memo(function DailyForecast() {
  const q = useForecast()
  const days = q.data?.data.daily.days ?? []
  const lo = Math.min(...days.map((d) => d.tempMin ?? Infinity))
  const hi = Math.max(...days.map((d) => d.tempMax ?? -Infinity))
  const span = hi - lo || 1

  return (
    <Panel
      code="D-01"
      title="7-DAY OUTLOOK"
      meta={<span>{q.data?.data.daily.provenance.label ?? 'MODEL'}</span>}
      bodyClassName={s.body}
    >
      {days.length === 0 ? (
        <div className={s.pending}>
          {q.isError || q.failureCount > 0 ? 'NO DATA' : 'ACQUIRING…'}
        </div>
      ) : (
        <table className={s.table}>
          <caption className="visually-hidden">7日間の予報</caption>
          <thead>
            <tr>
              <th scope="col">DATE</th>
              <th scope="col">WX</th>
              <th scope="col" className={s.rangeHead}>
                MIN / MAX °C
              </th>
              <th scope="col">POP</th>
              <th scope="col">PRCP</th>
              <th scope="col">WIND</th>
              <th scope="col">UV</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => {
              const inst = dateKeyToInstant(d.date)
              const wd = formatWeekday(inst)
              const c = CONDITION_LABEL[d.condition]
              const left = (((d.tempMin ?? lo) - lo) / span) * 100
              const width = (((d.tempMax ?? hi) - (d.tempMin ?? lo)) / span) * 100
              return (
                <tr key={d.date} data-today={i === 0 || undefined}>
                  <th scope="row">
                    <span className={s.date}>{formatShortDate(inst)}</span>
                    <span className={s.wd} data-weekend={wd === 'SAT' || wd === 'SUN' || undefined}>
                      {i === 0 ? 'TODAY' : wd}
                    </span>
                  </th>
                  <td>
                    <span className={s.code}>{c.code}</span>{' '}
                    <span className={`${s.ja} ja`}>{c.ja}</span>
                  </td>
                  <td>
                    <div className={s.rangeCell}>
                      <span className={s.min}>{fmt(d.tempMin)}</span>
                      <span className={s.range} aria-hidden="true">
                        <span
                          className={s.rangeFill}
                          style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                        />
                      </span>
                      <span className={s.max}>{fmt(d.tempMax)}</span>
                    </div>
                  </td>
                  <td data-hot={(d.precipitationProbability ?? 0) >= 50 || undefined}>
                    {fmt(d.precipitationProbability, 0)}
                    <small>%</small>
                  </td>
                  <td>
                    {fmt(d.precipitationSum)}
                    <small>mm</small>
                  </td>
                  <td>
                    {fmt(d.windSpeedMax)}
                    <small>
                      {' '}
                      {d.windDirectionDominant != null ? compass16(d.windDirectionDominant) : ''}
                    </small>
                  </td>
                  <td>{fmt(d.uvIndexMax)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Panel>
  )
})
