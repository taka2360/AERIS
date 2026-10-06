/**
 * T-01 — 24H atmospheric timeline. One shared time axis, one shared cursor.
 * The cursor index is the single piece of interactive state; tracks are
 * memoised on data and only the overlay + readout follow the cursor.
 */
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { CONDITION_LABEL, compass16 } from '@/domain/derive'
import type { HourlyPoint } from '@/domain/model'
import {
  formatHour,
  formatShortDate,
  formatTime,
  formatWeekday,
  dateKeyToInstant,
} from '@/domain/time'
import { useMinuteClock } from '@/query/clock'
import { useTimeCursor } from '@/query/time-cursor'
import { useForecast } from '@/query/hooks'
import { fmt } from '../format'
import { Panel } from '../primitives/Panel'
import { pct, VB_H } from './geometry'
import { buildTimelineModel } from './timeline-model'
import {
  computeLayouts,
  HumidityTrack,
  PrecipTrack,
  PressureTrack,
  TempTrack,
  trackY,
  WindTrack,
  type TrackLayout,
} from './Tracks'
import s from './Timeline.module.css'

/** Track heights are authored in px at a 16px root and scale with the root font size. */
const rem = (px: number) => `${px / 16}rem`

const TRACK_ORDER = ['temp', 'precip', 'hum', 'pres', 'wind'] as const
const TRACK_COMPONENT = {
  temp: TempTrack,
  precip: PrecipTrack,
  hum: HumidityTrack,
  pres: PressureTrack,
  wind: WindTrack,
}

function valueText(p: HourlyPoint): string {
  return [
    `${formatTime(p.time, false)}`,
    `気温 ${fmt(p.temperature)}度`,
    `降水 ${fmt(p.precipitation)}ミリ 確率${fmt(p.precipitationProbability, 0)}%`,
    `湿度 ${fmt(p.humidity, 0)}%`,
    `気圧 ${fmt(p.pressure)}ヘクトパスカル`,
    `風速 ${fmt(p.windSpeed)}メートル`,
  ].join('、')
}

/** Readout rows grouped by the track they belong to (main value first). */
function readoutGroups(
  p: HourlyPoint,
): Array<{ id: string; rows: Array<[string, string, string]> }> {
  return [
    {
      id: 'temp',
      rows: [
        ['TEMP', fmt(p.temperature), '°C'],
        ['FEELS', fmt(p.apparentTemperature), '°C'],
        ['DEW', fmt(p.dewPoint), '°C'],
      ],
    },
    {
      id: 'precip',
      rows: [
        ['PRECIP', fmt(p.precipitation), 'mm/h'],
        ['POP', fmt(p.precipitationProbability, 0), '%'],
      ],
    },
    { id: 'hum', rows: [['HUMID', fmt(p.humidity, 0), '%']] },
    { id: 'pres', rows: [['PRESS', fmt(p.pressure), 'hPa']] },
    {
      id: 'wind',
      rows: [
        [
          'WIND',
          fmt(p.windSpeed),
          `m/s ${p.windDirection != null ? compass16(p.windDirection) : ''}`,
        ],
        ['GUST', fmt(p.gust), 'm/s'],
      ],
    },
    { id: 'cloud', rows: [['CLOUD', fmt(p.cloudCover, 0), '%']] },
  ]
}

const Readout = memo(function Readout({
  point,
  offsetH,
  isPast,
  active,
}: {
  point: HourlyPoint
  offsetH: number
  isPast: boolean
  active: boolean
}) {
  const cond = CONDITION_LABEL[point.condition]
  return (
    <aside
      className={s.readout}
      data-active={active || undefined}
      data-past={isPast || undefined}
      aria-label="カーソル位置の値"
    >
      <div className={s.readoutHead}>
        <span className={s.readoutDate}>
          {formatShortDate(point.time)} {formatWeekday(point.time)}
        </span>
        <span className={s.readoutOffset}>
          {offsetH === 0 && !active ? 'NOW' : 'CURSOR'} · T{offsetH >= 0 ? '+' : '−'}
          {String(Math.abs(offsetH)).padStart(2, '0')}H
        </span>
      </div>
      <div className={s.readoutTime}>{formatTime(point.time, false)}</div>
      <div className={s.readoutKind}>
        {isPast ? '■ ANALYSIS' : '□ FORECAST'} · {cond.code} <span className="ja">{cond.ja}</span>
      </div>
      <dl className={s.readoutRows}>
        {readoutGroups(point).map((g) => (
          <div key={g.id} className={s.readoutGroup}>
            {g.rows.map(([k, v, u], i) => (
              <div key={k} className={s.readoutRow} data-main={i === 0 || undefined}>
                <dt>{k}</dt>
                <dd>
                  <b>{v}</b> <span>{u}</span>
                </dd>
              </div>
            ))}
          </div>
        ))}
      </dl>
    </aside>
  )
})

type ProbeValue = { v: number | null; text: string; sub?: string }

function probeValues(p: HourlyPoint): Record<string, ProbeValue> {
  return {
    temp: { v: p.temperature, text: `${fmt(p.temperature)}°C` },
    precip: {
      v: p.precipitation ?? 0,
      text: `${fmt(p.precipitation)} mm`,
      sub: `${fmt(p.precipitationProbability, 0)}%`,
    },
    hum: { v: p.humidity, text: `${fmt(p.humidity, 0)}%` },
    pres: { v: p.pressure, text: `${fmt(p.pressure)} hPa` },
    wind: {
      v: p.windSpeed,
      text: `${fmt(p.windSpeed)} m/s`,
      sub: p.windDirection != null ? compass16(p.windDirection) : undefined,
    },
  }
}

/**
 * Values at the cursor, written on the plots themselves: a mark on each
 * series and a chip beside it, flipped to the left in the right third so it
 * never runs off the plot.
 */
const Probe = memo(function Probe({
  layouts,
  point,
  idx,
  n,
  isPast,
  active,
}: {
  layouts: TrackLayout[]
  point: HourlyPoint
  idx: number
  n: number
  isPast: boolean
  active: boolean
}) {
  const values = probeValues(point)
  const flip = idx > (n - 1) * 0.66
  return (
    <div
      className={s.probe}
      data-active={active || undefined}
      data-past={isPast || undefined}
      aria-hidden="true"
    >
      {layouts.map((l) => {
        const pv = values[l.id]
        if (!pv) return null
        const top = pv.v == null ? null : (trackY(l)(pv.v) / VB_H) * 100
        return (
          <div key={l.id} className={s.probeRow} style={{ height: rem(l.height) }}>
            {top != null && (
              <span className={s.probeDot} style={{ left: pct(idx, n), top: `${top}%` }} />
            )}
            <span
              className={s.probeChip}
              data-flip={flip || undefined}
              style={{
                left: pct(idx, n),
                top: `clamp(10px, ${top ?? 50}%, calc(100% - 10px))`,
              }}
            >
              <b>{pv.text}</b>
              {pv.sub && <span>{pv.sub}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
})

function TrackLabels({ layouts }: { layouts: TrackLayout[] }) {
  return (
    <div className={s.labels} aria-hidden="true">
      <div className={s.axisSpacer} />
      {layouts.map((l) => (
        <div key={l.id} className={s.labelCell} style={{ height: rem(l.height) }}>
          <span className={s.labelName}>{l.label}</span>
          <span className={s.labelUnit}>{l.unit}</span>
          {l.ticks
            .filter((_, i, arr) => arr.length <= Math.floor(l.height / 15) || i % 2 === 0)
            .map((t) => {
              const [lo, hi] = l.domain
              const top = (1 - (t.value - lo) / (hi - lo)) * 100
              // Keep clear of the track name in the top-left corner.
              const nameZone = (30 / l.height) * 100
              if (top < nameZone || top > 96) return null
              return (
                <span key={t.value} className={s.tick} style={{ top: `${top}%` }}>
                  {t.label}
                </span>
              )
            })}
        </div>
      ))}
    </div>
  )
}

export const Timeline = memo(function Timeline() {
  const forecast = useForecast()
  const now = useMinuteClock()
  const plotRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const time = useTimeCursor()

  const model = useMemo(
    () =>
      forecast.data
        ? buildTimelineModel(forecast.data.data.hourly.points, forecast.data.data.daily.days, now)
        : null,
    [forecast.data, now],
  )
  const layouts = useMemo(() => (model ? computeLayouts(model.points) : null), [model])

  const n = model?.points.length ?? 0
  const idx = cursor ?? model?.nowPoint ?? 0

  const indexFromPointer = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const rect = plotRef.current?.getBoundingClientRect()
      if (!rect || n < 2) return null
      const frac = (e.clientX - rect.left) / rect.width
      return Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))))
    },
    [n],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!model) return
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageUp: -6, PageDown: 6 }
    if (e.key in step) {
      setCursor(Math.max(0, Math.min(n - 1, idx + step[e.key]!)))
    } else if (e.key === 'Home') setCursor(0)
    else if (e.key === 'End') setCursor(n - 1)
    else if (e.key === 'Escape') setCursor(null)
    // Pin the whole terminal (map, events) to the hour under the cursor.
    else if (e.key === 'Enter') time.scrubTo(model.points[idx]!.time)
    else return
    e.preventDefault()
  }

  if (!model || !layouts) {
    return (
      <Panel code="T-01" title="24H ATMOSPHERIC TIMELINE" className={s.panel}>
        <div className={s.empty}>
          {forecast.isError
            ? '■ NO FORECAST DATA'
            : forecast.failureCount > 0
              ? `▲ FORECAST LINK RETRYING (${forecast.failureCount})`
              : '◐ ACQUIRING FORECAST…'}
        </div>
      </Panel>
    )
  }

  const ordered = TRACK_ORDER.map((id) => layouts[id]!)
  const point = model.points[idx]!
  const offsetH = idx - model.nowPoint
  // Where the global time cursor sits on this axis while scrubbing.
  const pinned =
    time.mode === 'scrub'
      ? (() => {
          const i = model.points.findIndex((p) => p.time >= time.t)
          return i >= 0 ? i : null
        })()
      : null
  const totalHeight = ordered.reduce((a, l) => a + l.height, 0)

  return (
    <Panel
      code="T-01"
      title="24H ATMOSPHERIC TIMELINE"
      className={s.panel}
      meta={
        <>
          <span className={s.legendPast}>━ ANALYSIS</span>
          <span className={s.legendFuture}>┅ FORECAST</span>
          <span>T−06H … T+24H</span>
          <span className={s.hint}>ENTER / DBL-CLICK: 地図をこの時刻へ</span>
        </>
      }
      bodyClassName={s.body}
    >
      <div className={s.layout}>
        <TrackLabels layouts={ordered} />
        <div
          ref={plotRef}
          className={s.plots}
          role="slider"
          tabIndex={0}
          aria-label="時刻カーソル(←→で1時間、PageUp/Downで6時間移動、Escで現在、Enterで地図をこの時刻へ)"
          aria-valuemin={0}
          aria-valuemax={n - 1}
          aria-valuenow={idx}
          aria-valuetext={valueText(point)}
          onKeyDown={onKeyDown}
          onPointerMove={(e) => {
            const i = indexFromPointer(e)
            if (i != null) setCursor(i)
          }}
          onPointerDown={(e) => {
            const i = indexFromPointer(e)
            if (i != null) setCursor(i)
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setCursor(null)
          }}
          onDoubleClick={() => time.scrubTo(model.points[idx]!.time)}
        >
          <div className={s.axis} aria-hidden="true">
            {model.points.map((p, i) =>
              // Every 3h; skip the label hidden under the NOW tag.
              i % 3 === 0 && Math.abs(i - model.nowIndex) > 0.9 ? (
                <span key={p.time} className={s.axisTick} style={{ left: pct(i, n) }}>
                  {formatHour(p.time)}
                </span>
              ) : null,
            )}
          </div>

          <div className={s.trackStack} style={{ height: rem(totalHeight) }}>
            {/* Night bands span every track */}
            {model.nights.map((nb) => (
              <div
                key={nb.from}
                className={s.night}
                style={{
                  left: pct(nb.from, n),
                  width: `calc(${pct(nb.to, n)} - ${pct(nb.from, n)})`,
                }}
                aria-hidden="true"
              />
            ))}
            {model.dayStarts.map((d) => (
              <div
                key={d.date}
                className={s.dayLine}
                style={{ left: pct(d.index, n) }}
                aria-hidden="true"
              >
                <span>
                  {formatShortDate(dateKeyToInstant(d.date))}{' '}
                  {formatWeekday(dateKeyToInstant(d.date))}
                </span>
              </div>
            ))}
            {ordered.map((l) => {
              const C = TRACK_COMPONENT[l.id as keyof typeof TRACK_COMPONENT]
              return (
                <div key={l.id} className={s.track} style={{ height: rem(l.height) }}>
                  <C points={model.points} nowIndex={model.nowIndex} layout={l} />
                </div>
              )
            })}
            {/* Wind direction arrows (HTML so they don't stretch) */}
            <div
              className={s.windArrows}
              style={{ height: rem(layouts.wind!.height) }}
              aria-hidden="true"
            >
              {model.points.map((p, i) =>
                i % 2 === 0 && p.windDirection != null ? (
                  <span
                    key={p.time}
                    className={s.windArrow}
                    data-past={i < model.nowIndex || undefined}
                    style={{
                      left: pct(i, n),
                      transform: `translateX(-50%) rotate(${p.windDirection + 180}deg)`,
                    }}
                  >
                    ↑
                  </span>
                ) : null,
              )}
            </div>
            <div className={s.nowLine} style={{ left: pct(model.nowIndex, n) }} aria-hidden="true">
              <span>NOW</span>
            </div>
            <div
              className={s.cursor}
              style={{ left: pct(idx, n) }}
              data-active={cursor != null || undefined}
              aria-hidden="true"
            >
              <span>{formatTime(point.time, false)}</span>
            </div>
            <Probe
              layouts={ordered}
              point={point}
              idx={idx}
              n={n}
              isPast={idx < model.nowIndex}
              active={cursor != null}
            />
            {pinned != null && (
              <div className={s.pinned} style={{ left: pct(pinned, n) }} aria-hidden="true">
                <span>SCRUB</span>
              </div>
            )}
          </div>
        </div>
        <Readout
          point={point}
          offsetH={offsetH}
          isPast={idx < model.nowIndex}
          active={cursor != null}
        />
      </div>
    </Panel>
  )
})
