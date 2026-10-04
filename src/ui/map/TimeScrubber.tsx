/**
 * Unified time scrubber for the spatial scope. It moves the GLOBAL time
 * cursor; the span shown is declared by the view (its data's coverage).
 * The track is amber over observed time and cyan over forecast time, with
 * optional ticks for events. LIVE returns every view to the present.
 */
import { epoch, formatTime, minutesBetween, toInstant, type Instant } from '@/domain/time'
import type { TemporalRole } from '@/domain/earth/common'
import type { TimeCursor } from '@/query/time-cursor'
import s from './SpatialScope.module.css'

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
  const total = minutesBetween(span.start, span.end)
  const value = Math.min(total, Math.max(0, minutesBetween(span.start, cursor.t)))
  const obsPct = (Math.max(0, minutesBetween(span.start, span.observedUntil)) / total) * 100
  const offset = shown ? Math.round(minutesBetween(cursor.now, shown.validTime) / 5) * 5 : 0
  const outOfSpan = epoch(cursor.t) < epoch(span.start) || epoch(cursor.t) > epoch(span.end)

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
          min={0}
          max={total}
          step={span.stepMin}
          value={value}
          onChange={(e) => {
            setPlaying(false)
            cursor.scrubTo(toInstant(epoch(span.start) + Number(e.target.value) * 60_000))
          }}
          aria-label="時刻カーソル(地図)"
          aria-valuetext={`${formatTime(cursor.t, false)} ${cursor.mode === 'live' ? '現在' : '指定時刻'}`}
          style={{ ['--obs' as string]: `${obsPct}%` }}
        />
        {ticks.map((k, i) => {
          const m = minutesBetween(span.start, k.t)
          if (m < 0 || m > total) return null
          return (
            <i
              key={i}
              className={s.tick}
              data-tone={k.tone}
              style={{ left: `${(m / total) * 100}%` }}
              aria-hidden="true"
            />
          )
        })}
      </span>
      {cursor.mode === 'scrub' && (
        <button type="button" className={s.live} onClick={cursor.goLive}>
          LIVE
        </button>
      )}
    </div>
  )
}
