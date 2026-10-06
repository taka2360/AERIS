/**
 * D-02 — 14-day trend: the model's daily max/min for two weeks against the
 * 1991–2020 normal band, with rain and each day's difference from normal.
 * Days 8–14 are shaded: deterministic model skill drops off there, so they
 * are shown as a trend, not a forecast to plan by.
 */
import { memo, useMemo, type CSSProperties } from 'react'
import { ANOMALY_LABEL, classify } from '@/domain/climate'
import type { DailyPoint } from '@/domain/model'
import { dateKeyToInstant, formatShortDate, formatWeekday } from '@/domain/time'
import { useClimateNormals, useExtendedDaily } from '@/query/outlook-hooks'
import { fmt, signed } from '../format'
import { Panel } from '../primitives/Panel'
import { QualityTags } from '../primitives/primitives'
import { WxIcon } from './WxIcon'
import s from './TwoWeek.module.css'

const DAYS = 14
/** First day (0-based) shown as low-confidence trend */
const LOW_SKILL_FROM = 7

export const TwoWeek = memo(function TwoWeek() {
  const ext = useExtendedDaily()
  const normals = useClimateNormals()
  const today = ext.data?.data.today
  const days = useMemo<DailyPoint[]>(
    () => (ext.data?.data.days ?? []).filter((d) => !today || d.date >= today).slice(0, DAYS),
    [ext.data, today],
  )
  const normal = useMemo(
    () => new Map((normals.data?.data.days ?? []).map((n) => [n.date, n])),
    [normals.data],
  )

  const n = days.length
  const temps = days
    .flatMap((d) => {
      const nd = normal.get(d.date)
      return [d.tempMax, d.tempMin, nd?.tmax, nd?.tmin]
    })
    .filter((v): v is number => v != null)
  const lo = Math.min(...temps)
  const hi = Math.max(...temps)
  const span = hi - lo || 1
  const x = (i: number) => ((i + 0.5) / n) * 1000
  const y = (v: number) => 84 - ((v - lo) / span) * 66
  const line = (pick: (d: DailyPoint, i: number) => number | null | undefined) =>
    days
      .flatMap((d, i) => {
        const v = pick(d, i)
        return v == null ? [] : [`${x(i)},${y(v)}`]
      })
      .join(' ')
  const nMax = line((d) => normal.get(d.date)?.tmax)
  const nMin = line((d) => normal.get(d.date)?.tmin)
  const maxRain = Math.max(5, ...days.map((d) => d.precipitationSum ?? 0))

  return (
    <Panel
      code="D-02"
      title="14-DAY TREND"
      bodyClassName={s.body}
      meta={
        <>
          <QualityTags
            provenance={{
              role: 'forecast',
              derivation: 'modeled',
            }}
          />
          <span>
            {normals.data
              ? '平年: ERA5 1991–2020'
              : normals.isError
                ? '平年値 取得失敗'
                : '平年値 取得中…'}
          </span>
        </>
      }
    >
      {n === 0 ? (
        <div className={s.pending}>{ext.isError ? '■ NO DATA' : '◐ ACQUIRING…'}</div>
      ) : (
        <div className={s.scroller}>
          <div className={s.grid} style={{ '--n': n, '--skill': LOW_SKILL_FROM } as CSSProperties}>
            <div className={s.label} />
            {days.map((d, i) => {
              const inst = dateKeyToInstant(d.date)
              const wd = formatWeekday(inst)
              return (
                <div
                  key={d.date}
                  className={s.day}
                  data-today={i === 0 || undefined}
                  data-low={i >= LOW_SKILL_FROM || undefined}
                >
                  <span className={s.date}>{formatShortDate(inst)}</span>
                  <span className={s.wd} data-weekend={wd === 'SAT' || wd === 'SUN' || undefined}>
                    {i === 0 ? 'TODAY' : wd}
                  </span>
                  <WxIcon condition={d.condition} />
                </div>
              )
            })}

            <div className={s.label}>
              TEMP
              <small>°C</small>
              <span className={s.keyMax}>━ MAX</span>
              <span className={s.keyMin}>━ MIN</span>
              <span className={s.keyNormal}>┅ 平年</span>
            </div>
            <div
              className={s.chart}
              role="img"
              aria-label={days
                .map((d) => `${d.date} 最高${fmt(d.tempMax)} 最低${fmt(d.tempMin)}`)
                .join('、')}
            >
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
                <rect
                  className={s.lowSkill}
                  x={(LOW_SKILL_FROM / n) * 1000}
                  y={0}
                  width={1000 - (LOW_SKILL_FROM / n) * 1000}
                  height={100}
                />
                {nMax && nMin && (
                  <polygon
                    className={s.normalBand}
                    points={`${nMax} ${nMin.split(' ').reverse().join(' ')}`}
                  />
                )}
                <polyline className={s.normalMax} points={nMax} />
                <polyline className={s.normalMin} points={nMin} />
                <polyline className={s.maxLine} points={line((d) => d.tempMax)} />
                <polyline className={s.minLine} points={line((d) => d.tempMin)} />
              </svg>
              {days.map((d, i) => (
                <div
                  key={d.date}
                  className={s.col}
                  style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}
                >
                  {d.tempMax != null && (
                    <span className={s.ptMax} style={{ top: `${y(d.tempMax)}%` }}>
                      <b>{fmt(d.tempMax, 0)}</b>
                    </span>
                  )}
                  {d.tempMin != null && (
                    <span className={s.ptMin} style={{ top: `${y(d.tempMin)}%` }}>
                      <b>{fmt(d.tempMin, 0)}</b>
                    </span>
                  )}
                </div>
              ))}
              <span className={s.skillNote} style={{ left: `${(LOW_SKILL_FROM / n) * 100}%` }}>
                8日目以降は傾向(確度低)
              </span>
            </div>

            <div className={s.label}>
              DIFF
              <small>MAX vs 平年</small>
            </div>
            {days.map((d, i) => {
              const nd = normal.get(d.date)
              const diff = d.tempMax != null && nd ? d.tempMax - nd.tmax : null
              const cls = d.tempMax != null && nd ? classify(d.tempMax, nd.tmaxPct) : null
              return (
                <div
                  key={d.date}
                  className={s.diff}
                  data-low={i >= LOW_SKILL_FROM || undefined}
                  data-cls={cls ?? undefined}
                  title={cls ? ANOMALY_LABEL[cls] : undefined}
                >
                  <b>{diff == null ? '--' : signed(diff)}</b>
                </div>
              )
            })}

            <div className={s.label}>
              RAIN
              <small>mm · %</small>
            </div>
            {days.map((d, i) => (
              <div key={d.date} className={s.rain} data-low={i >= LOW_SKILL_FROM || undefined}>
                <span className={s.rainBar} aria-hidden="true">
                  <i style={{ height: `${((d.precipitationSum ?? 0) / maxRain) * 100}%` }} />
                </span>
                <b data-wet={(d.precipitationSum ?? 0) >= 1 || undefined}>
                  {fmt(d.precipitationSum)}
                </b>
                <small>
                  {d.precipitationProbability != null ? `${d.precipitationProbability}%` : '--'}
                </small>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
})
