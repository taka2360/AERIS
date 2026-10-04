import { memo } from 'react'
import { formatDate, formatTime, minutesBetween } from '@/domain/time'
import { useTimeCursor } from '@/query/time-cursor'
import s from './TimeCursorBand.module.css'

function offsetLabel(min: number): string {
  const sign = min < 0 ? '−' : '+'
  const a = Math.abs(Math.round(min))
  return `T${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
}

/**
 * Shown while the global time cursor is pinned away from the present, so a
 * past (or forecast) state is never mistaken for the current one.
 */
export const TimeCursorBand = memo(function TimeCursorBand() {
  const { mode, t, now, goLive } = useTimeCursor()
  if (mode === 'live') return null
  const off = minutesBetween(now, t)
  return (
    <div className={s.band} role="status" aria-live="polite">
      <span className={s.tag}>SCRUB</span>
      <span className={s.offset}>{offsetLabel(off)}</span>
      <span className={s.time}>
        {formatDate(t)} {formatTime(t, false)} JST の状態を表示中
        {off > 0 ? '(予測)' : '(過去)'}
      </span>
      <button type="button" className={s.live} onClick={goLive}>
        LIVE へ戻る
      </button>
    </div>
  )
})
