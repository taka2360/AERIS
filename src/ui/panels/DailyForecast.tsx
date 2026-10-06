/**
 * D-01 — 7-day outlook as a strip of day columns sharing one temperature
 * chart, so the week reads left to right at a glance: sky, the max/min
 * trend, rain chance and amount, wind, UV and daylight. A digest line on top
 * names the notable days (values as forecast, no AERIS judgement).
 */
import { memo, useState, type CSSProperties, type ReactNode } from 'react'
import { CONDITION_LABEL, compass16 } from '@/domain/derive'
import type { DailyPoint } from '@/domain/model'
import { dateKeyToInstant, formatShortDate, formatTime, formatWeekday } from '@/domain/time'
import { useForecast } from '@/query/hooks'
import { fmt } from '../format'
import { Panel } from '../primitives/Panel'
import { WxIcon } from './WxIcon'
import s from './DailyForecast.module.css'

/** WHO UV index categories */
const UV_LEVELS = [
  { min: 11, level: 'extreme', ja: '極端' },
  { min: 8, level: 'very-high', ja: '非常に強い' },
  { min: 6, level: 'high', ja: '強い' },
  { min: 3, level: 'moderate', ja: '中程度' },
  { min: 0, level: 'low', ja: '弱い' },
] as const

function uvLevel(v: number | null) {
  return v == null ? null : (UV_LEVELS.find((l) => v >= l.min) ?? null)
}

const RAIN_POP = 50
/** Chart frame: top/bottom margins (%) leave room for the value labels. */
const Y_TOP = 26
const Y_BOTTOM = 76

const label = (d: DailyPoint) => formatShortDate(dateKeyToInstant(d.date))

function Digest({ days }: { days: DailyPoint[] }) {
  const withMax = days.filter((d) => d.tempMax != null)
  const withMin = days.filter((d) => d.tempMin != null)
  const hottest = withMax.reduce<DailyPoint | null>(
    (a, d) => (!a || d.tempMax! > a.tempMax! ? d : a),
    null,
  )
  const coldest = withMin.reduce<DailyPoint | null>(
    (a, d) => (!a || d.tempMin! < a.tempMin! ? d : a),
    null,
  )
  const windiest = days.reduce<DailyPoint | null>(
    (a, d) => (d.windSpeedMax != null && (!a || d.windSpeedMax > a.windSpeedMax!) ? d : a),
    null,
  )
  const wet = days.filter((d) => (d.precipitationProbability ?? 0) >= RAIN_POP)
  return (
    <div className={s.digest}>
      <span className={s.digestTag}>WEEK</span>
      <span>
        <i>降水確率{RAIN_POP}%以上</i>
        <b data-tone={wet.length ? 'wet' : undefined}>{wet.length}日</b>
        {wet.length > 0 && <em>{wet.map(label).join(' ')}</em>}
      </span>
      {hottest && (
        <span>
          <i>最高</i>
          <b data-tone="max">{fmt(hottest.tempMax)}°</b>
          <em>{label(hottest)}</em>
        </span>
      )}
      {coldest && (
        <span>
          <i>最低</i>
          <b data-tone="min">{fmt(coldest.tempMin)}°</b>
          <em>{label(coldest)}</em>
        </span>
      )}
      {windiest && (
        <span>
          <i>最大風速</i>
          <b>{fmt(windiest.windSpeedMax)} m/s</b>
          <em>{label(windiest)}</em>
        </span>
      )}
    </div>
  )
}

/** Max/min temperature trend across the day columns. */
function TempChart({ days, hover }: { days: DailyPoint[]; hover: number | null }) {
  const n = days.length
  const temps = days.flatMap((d) => [d.tempMax, d.tempMin]).filter((v): v is number => v != null)
  const lo = Math.min(...temps)
  const hi = Math.max(...temps)
  const span = hi - lo || 1
  const x = (i: number) => ((i + 0.5) / n) * 100
  const y = (v: number) => Y_BOTTOM - ((v - lo) / span) * (Y_BOTTOM - Y_TOP)
  const pts = (k: 'tempMax' | 'tempMin') =>
    days.flatMap((d, i) => (d[k] == null ? [] : [[x(i), y(d[k])] as const]))
  const maxPts = pts('tempMax')
  const minPts = pts('tempMin')
  const line = (p: ReadonlyArray<readonly [number, number]>) =>
    p.map(([a, b]) => `${a * 10},${b}`).join(' ')
  return (
    <div className={s.chart} aria-hidden="true">
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
        <polygon className={s.band} points={`${line(maxPts)} ${line([...minPts].reverse())}`} />
        <polyline className={s.maxLine} points={line(maxPts)} />
        <polyline className={s.minLine} points={line(minPts)} />
      </svg>
      {days.map((d, i) => (
        <div key={d.date} className={s.chartCol} data-hover={hover === i || undefined}>
          {d.tempMax != null && (
            <span className={s.maxPt} style={{ top: `${y(d.tempMax)}%` }}>
              <b>{fmt(d.tempMax)}</b>
            </span>
          )}
          {d.tempMin != null && (
            <span className={s.minPt} style={{ top: `${y(d.tempMin)}%` }}>
              <b>{fmt(d.tempMin)}</b>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export const DailyForecast = memo(function DailyForecast() {
  const q = useForecast()
  const days = q.data?.data.daily.days ?? []
  const [hover, setHover] = useState<number | null>(null)
  const maxRain = Math.max(1, ...days.map((d) => d.precipitationSum ?? 0))

  // One grid: a label column, then one column per day. Every cell of a day
  // shares its column's hover state.
  const cell = (i: number, cls: string | undefined, children: ReactNode, extra?: object) => (
    <div
      className={`${s.cell} ${cls ?? ''}`}
      key={i}
      data-col={i}
      data-today={i === 0 || undefined}
      data-hover={hover === i || undefined}
      onPointerEnter={() => setHover(i)}
      {...extra}
    >
      {children}
    </div>
  )

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
        <>
          <Digest days={days} />
          <div className={s.scroller}>
            <div
              className={s.grid}
              style={{ '--n': days.length } as CSSProperties}
              role="table"
              aria-label="7日間の予報"
              onPointerLeave={() => setHover(null)}
            >
              <div role="row" className={s.row}>
                <div role="columnheader" className={s.rowLabel}>
                  DATE
                </div>
                {days.map((d, i) => {
                  const inst = dateKeyToInstant(d.date)
                  const wd = formatWeekday(inst)
                  return cell(
                    i,
                    s.head,
                    <>
                      <span className={s.date}>{formatShortDate(inst)}</span>
                      <span
                        className={s.wd}
                        data-weekend={wd === 'SAT' || wd === 'SUN' || undefined}
                      >
                        {i === 0 ? 'TODAY' : wd}
                      </span>
                    </>,
                    { role: 'columnheader' },
                  )
                })}
              </div>

              <div role="row" className={s.row}>
                <div role="rowheader" className={s.rowLabel}>
                  SKY
                </div>
                {days.map((d, i) => {
                  const c = CONDITION_LABEL[d.condition]
                  return cell(
                    i,
                    s.sky,
                    <>
                      <WxIcon condition={d.condition} />
                      <span className={`${s.ja} ja`}>{c.ja}</span>
                      <span className={s.code}>{c.code}</span>
                    </>,
                    { role: 'cell' },
                  )
                })}
              </div>

              <div role="row" className={s.row}>
                <div role="rowheader" className={s.rowLabel}>
                  TEMP
                  <small>°C</small>
                  <span className={s.legendMax}>━ MAX</span>
                  <span className={s.legendMin}>━ MIN</span>
                </div>
                <div role="cell" className={s.chartCell}>
                  <span className="visually-hidden">
                    {days
                      .map((d) => `${label(d)} 最高${fmt(d.tempMax)}度 最低${fmt(d.tempMin)}度`)
                      .join('、')}
                  </span>
                  <TempChart days={days} hover={hover} />
                </div>
              </div>

              <div role="row" className={s.row}>
                <div role="rowheader" className={s.rowLabel}>
                  POP
                  <small>%</small>
                </div>
                {days.map((d, i) => {
                  const pop = d.precipitationProbability ?? 0
                  return cell(
                    i,
                    s.pop,
                    <>
                      <span className={s.meter} aria-hidden="true">
                        <i style={{ width: `${pop}%` }} />
                      </span>
                      <b data-wet={pop >= RAIN_POP || undefined}>
                        {fmt(d.precipitationProbability, 0)}
                        <small>%</small>
                      </b>
                    </>,
                    { role: 'cell' },
                  )
                })}
              </div>

              <div role="row" className={s.row}>
                <div role="rowheader" className={s.rowLabel}>
                  PRCP
                  <small>mm</small>
                </div>
                {days.map((d, i) =>
                  cell(
                    i,
                    s.prcp,
                    <>
                      <span className={s.rainBar} aria-hidden="true">
                        <i style={{ height: `${((d.precipitationSum ?? 0) / maxRain) * 100}%` }} />
                      </span>
                      <b data-wet={(d.precipitationSum ?? 0) >= 1 || undefined}>
                        {fmt(d.precipitationSum)}
                      </b>
                    </>,
                    { role: 'cell' },
                  ),
                )}
              </div>

              <div role="row" className={s.row}>
                <div role="rowheader" className={s.rowLabel}>
                  WIND
                  <small>m/s</small>
                </div>
                {days.map((d, i) =>
                  cell(
                    i,
                    s.wind,
                    <>
                      {d.windDirectionDominant != null && (
                        <span
                          className={s.arrow}
                          aria-hidden="true"
                          // Points where the wind blows to (from + 180°).
                          style={{ transform: `rotate(${d.windDirectionDominant + 180}deg)` }}
                        >
                          ↑
                        </span>
                      )}
                      <b>{fmt(d.windSpeedMax)}</b>
                      <small>
                        {d.windDirectionDominant != null ? compass16(d.windDirectionDominant) : ''}
                        {d.gustMax != null ? ` G${fmt(d.gustMax, 0)}` : ''}
                      </small>
                    </>,
                    { role: 'cell' },
                  ),
                )}
              </div>

              <div role="row" className={s.row}>
                <div role="rowheader" className={s.rowLabel}>
                  UV
                </div>
                {days.map((d, i) => {
                  const lv = uvLevel(d.uvIndexMax)
                  return cell(
                    i,
                    s.uv,
                    <>
                      <b data-level={lv?.level}>{fmt(d.uvIndexMax)}</b>
                      <span className={`${s.uvJa} ja`} data-level={lv?.level}>
                        {lv?.ja ?? '--'}
                      </span>
                      <i className={s.uvBar} data-level={lv?.level} aria-hidden="true" />
                    </>,
                    { role: 'cell' },
                  )
                })}
              </div>

              <div role="row" className={s.row}>
                <div role="rowheader" className={s.rowLabel}>
                  SUN
                </div>
                {days.map((d, i) =>
                  cell(
                    i,
                    s.sun,
                    <>
                      <span>↑ {d.sunrise ? formatTime(d.sunrise, false) : '--:--'}</span>
                      <span>↓ {d.sunset ? formatTime(d.sunset, false) : '--:--'}</span>
                    </>,
                    { role: 'cell' },
                  ),
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Panel>
  )
})
