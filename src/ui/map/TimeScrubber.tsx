/**
 * Unified time scrubber for the spatial scope. It moves the GLOBAL time
 * cursor; the span shown is declared by the view (its data's coverage).
 * The track is amber over observed time and cyan over forecast time, with
 * optional ticks for events. LIVE returns every view to the present.
 * The present is the centre of the track; the past half rewinds faster the
 * further left (see scrub-scale.ts).
 */
import { epoch, formatTime, minutesBetween, toInstant, type Instant } from '@/domain/time'
import type { TemporalRole } from '@/domain/earth/common'
import type { TimeCursor } from '@/query/time-cursor'
import {
  keyStep,
  offsetToPosition,
  positionPct,
  positionToOffset,
  scaleMarks,
  scrubScale,
} from './scrub-scale'
import s from './SpatialScope.module.css'

/** Slider resolution: positions are integers in [-RES, RES]. */
const RES = 1000

export type ScrubSpan = {
  start: Instant
  end: Instant
  /** Boundary between observed and forecast time (usually the latest observation) */
  observedUntil: Instant
  stepMin: number
}

export type ScrubTick = { t: Instant; tone: 'event' | 'alert' }

export type ShownFrame = { validTime: Instant; role: TemporalRole } | null

const roleTag = (r: TemporalRole) => (r === 'observed' ? 'OBS' : r === 'analysis' ? 'ANL' : 'FCST')

export function TimeScrubber({
  cursor,
  span,
  shown,
  label,
  playing,
  setPlaying,
  ticks = [],
}: {
  cursor: TimeCursor
  span: ScrubSpan | null
  shown: ShownFrame
  label: string
  playing: boolean
  setPlaying: (v: boolean) => void
  ticks?: ScrubTick[]
}) {
  if (!span) return <div className={s.radarBar}>{label} · NO FRAMES</div>
  const now = cursor.now
  const sc = scrubScale(minutesBetween(span.start, now), minutesBetween(now, span.end))
  const pctOf = (t: Instant) => positionPct(sc, offsetToPosition(sc, minutesBetween(now, t)))
  const value = Math.round(offsetToPosition(sc, minutesBetween(now, cursor.t)) * RES)
  const obsPct = pctOf(span.observedUntil)
  const nowPct = positionPct(sc, 0)
  const offset = shown ? Math.round(minutesBetween(cursor.now, shown.validTime) / 5) * 5 : 0
  const outOfSpan = epoch(cursor.t) < epoch(span.start) || epoch(cursor.t) > epoch(span.end)
  // Times snap to the span's step (5 min) so frames line up.
  const goOffset = (min: number) => {
    setPlaying(false)
    const clamped = Math.max(-sc.pastMin, Math.min(sc.futureMin, min))
    const snapped = Math.round(clamped / span.stepMin) * span.stepMin
    cursor.scrubTo(toInstant(epoch(now) + snapped * 60_000))
  }
  const curOffset = minutesBetween(now, cursor.t)

  return (
    <div className={s.radarBar} data-mode={cursor.mode}>
      <button
        type="button"
        className={s.play}
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? '時間再生を停止' : '時間を再生'}
        aria-pressed={playing}
      >
        {playing ? '■' : '▶'}
      </button>
      {shown ? (
        <>
          <span className={s.radarTime} data-kind={shown.role}>
            {formatTime(shown.validTime, false)}
          </span>
          <span
            className={s.radarKind}
            data-kind={shown.role === 'observed' ? 'observation' : 'forecast'}
          >
            {roleTag(shown.role)} {offset >= 0 ? '+' : '−'}
            {Math.abs(offset)}M
          </span>
        </>
      ) : (
        <span className={s.radarKind} data-kind="none">
          {label} NO DATA{outOfSpan ? ' · OUT OF RANGE' : ''}
        </span>
      )}
      <span className={s.sliderWrap}>
        <input
          type="range"
          className={s.slider}
          min={sc.min * RES}
          max={sc.max * RES}
          step={1}
          value={value}
          onChange={(e) => goOffset(positionToOffset(sc, Number(e.target.value) / RES))}
          onKeyDown={(e) => {
            // Steps in time, not in track position: the curved past would make
            // fixed position steps vanish near now and leap far back.
            const step = keyStep(curOffset, span.stepMin)
            const to =
              e.key === 'ArrowLeft' || e.key === 'ArrowDown'
                ? curOffset - step
                : e.key === 'ArrowRight' || e.key === 'ArrowUp'
                  ? curOffset + step
                  : e.key === 'Home'
                    ? -sc.pastMin
                    : e.key === 'End'
                      ? sc.futureMin
                      : null
            if (to == null) return
            e.preventDefault()
            goOffset(to)
          }}
          aria-label="地図の時刻"
          aria-valuetext={`${formatTime(cursor.t, false)} ${cursor.mode === 'live' ? '現在' : '指定時刻'}`}
          style={{ ['--obs' as string]: `${obsPct}%`, ['--now' as string]: `${nowPct}%` }}
        />
        <i className={s.nowMark} style={{ left: `${nowPct}%` }} aria-hidden="true" />
        {ticks.map((k, i) => {
          if (epoch(k.t) < epoch(span.start) || epoch(k.t) > epoch(span.end)) return null
          return (
            <i
              key={i}
              className={s.tick}
              data-tone={k.tone}
              style={{ left: `${pctOf(k.t)}%` }}
              aria-hidden="true"
            />
          )
        })}
        <span className={s.scale} aria-hidden="true">
          {scaleMarks(sc).map((m) => (
            <span
              key={m.offset}
              data-now={m.offset === 0 || undefined}
              data-minor={m.minor || undefined}
              style={{ left: `${positionPct(sc, offsetToPosition(sc, m.offset))}%` }}
            >
              {m.label}
            </span>
          ))}
        </span>
      </span>
      {cursor.mode === 'scrub' && (
        <button type="button" className={s.live} onClick={cursor.goLive}>
          LIVE
        </button>
      )}
    </div>
  )
}
