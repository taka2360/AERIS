import { memo } from 'react'
import { epoch, formatTime, jstDateKey } from '@/domain/time'
import { useMinuteClock } from '@/query/clock'
import { useCurrentConditions, useForecast } from '@/query/hooks'
import { fmt } from '../format'
import { Panel } from '../primitives/Panel'
import { ProvTag, SegmentBar } from '../primitives/primitives'
import s from './Solar.module.css'

function uvCategory(uv: number): { ja: string; tone: 'green' | 'yellow' | 'amber' | 'red' } {
  if (uv < 3) return { ja: '弱い', tone: 'green' }
  if (uv < 6) return { ja: '中程度', tone: 'yellow' }
  if (uv < 8) return { ja: '強い', tone: 'amber' }
  return { ja: '非常に強い', tone: 'red' }
}

export const Solar = memo(function Solar() {
  const forecast = useForecast()
  const { current } = useCurrentConditions()
  const now = useMinuteClock()
  const today = forecast.data?.data.daily.days.find((d) => d.date === jstDateKey(now))

  const rise = today?.sunrise
  const set = today?.sunset
  let progress: number | null = null
  let daylight = ''
  if (rise && set) {
    const r = epoch(rise)
    const st = epoch(set)
    progress = (epoch(now) - r) / (st - r)
    const mins = Math.round((st - r) / 60_000)
    daylight = `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`
  }
  const isDay = progress != null && progress >= 0 && progress <= 1
  const p = Math.max(0, Math.min(1, progress ?? 0))
  // Arc from (-40,0) to (40,0), radius 40, sun position along the arc.
  const angle = Math.PI * (1 - p)
  const sx = 40 * Math.cos(angle)
  const sy = -36 * Math.sin(angle)

  const uvNow = current.uvIndex?.value
  const uvMax = today?.uvIndexMax ?? null
  const cat = uvCategory(uvMax ?? 0)

  return (
    <Panel
      code="S-02"
      title="SOLAR / UV"
      meta={<span>{progress == null ? 'NO DATA' : isDay ? 'DAY' : 'NIGHT'}</span>}
    >
      <div className={s.grid}>
        <svg className={s.arc} viewBox="-48 -42 96 48" aria-hidden="true">
          <line x1="-46" y1="0" x2="46" y2="0" className={s.horizon} />
          <path d="M -40 0 A 40 36 0 0 1 40 0" className={s.track} />
          {isDay && (
            <path
              d={`M -40 0 A 40 36 0 0 1 ${sx.toFixed(2)} ${sy.toFixed(2)}`}
              className={s.trackDone}
            />
          )}
          <circle cx={sx} cy={isDay ? sy : 3} r="3.2" className={isDay ? s.sun : s.sunDown} />
        </svg>
        <dl className={s.times}>
          <div>
            <dt>SUNRISE</dt>
            <dd>{rise ? formatTime(rise, false) : '--:--'}</dd>
          </div>
          <div>
            <dt>SUNSET</dt>
            <dd>{set ? formatTime(set, false) : '--:--'}</dd>
          </div>
          <div>
            <dt>DAYLIGHT</dt>
            <dd>{daylight || '--'}</dd>
          </div>
        </dl>
      </div>
      <div className={s.uv}>
        <span className={s.uvLabel}>UV NOW</span>
        <span className={s.uvValue}>{fmt(uvNow)}</span>
        <ProvTag provenance={current.uvIndex?.provenance} />
        <span className={s.uvLabel}>MAX</span>
        <span className={s.uvValue}>{fmt(uvMax)}</span>
        <span className={`${s.uvCat} ja`} data-tone={cat.tone}>
          {cat.ja}
        </span>
      </div>
      <SegmentBar
        value={(uvMax ?? 0) / 11}
        segments={22}
        tone={cat.tone}
        label={`最大UV指数 ${fmt(uvMax)}`}
      />
    </Panel>
  )
})
