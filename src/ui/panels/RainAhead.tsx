/**
 * R-01 — Rain in the next 60 minutes at the monitoring location, read from
 * JMA's high-resolution precipitation nowcast: the newest observed frame and
 * the 5-minute nowcast frames after it. The headline states what the frames
 * say (start / stop / continue); it is a reading, not an AERIS judgement.
 */
import { memo } from 'react'
import { formatTime, minutesBetween } from '@/domain/time'
import { useRainAhead, type RainStep } from '@/query/outlook-hooks'
import { Panel } from '../primitives/Panel'
import { QualityTags } from '../primitives/primitives'
import { legendColor, RADAR_PALETTE } from '../map/style'
import s from './RainAhead.module.css'

/** Bar height by intensity class: 0 (<1 mm/h) is a stub, 7 (80+) fills the bar. */
const barHeight = (level: number) => (level < 0 ? 0 : 16 + (level / 7) * 84)

const colorOf = (level: number) => legendColor((RADAR_PALETTE[level] ?? RADAR_PALETTE[0]!).rgba)

const mmh = (x: RainStep) => `${(x.label ?? '?').replace('–', '〜')} mm/h`

type Headline = { tone: 'dry' | 'rain' | 'onset' | 'unknown'; text: string; sub?: string }

function headline(steps: RainStep[]): Headline {
  const known = steps.filter((x) => x.level != null)
  if (known.length === 0) return { tone: 'unknown', text: 'NO DATA' }
  const base = steps[0]!
  const after = (x: RainStep) =>
    Math.max(0, Math.round(minutesBetween(base.frame.validFrom, x.frame.validFrom) / 5) * 5)
  const wet = (x: RainStep) => (x.level ?? -1) >= 0
  const peak = known.reduce((a, b) => ((b.level ?? -1) > (a.level ?? -1) ? b : a))
  if (!known.some(wet))
    return { tone: 'dry', text: '60分以内の降水なし', sub: 'NO RAIN NEXT 60 MIN' }
  if (wet(base)) {
    const stop = steps.find((x, i) => i > 0 && x.level === -1)
    return {
      tone: 'rain',
      text: stop ? `雨 · 約${after(stop)}分後にやむ見込み` : '雨が続く見込み',
      sub: `現在 ${mmh(base)} · 最大 ${mmh(peak)}`,
    }
  }
  const start = steps.find(wet)!
  return {
    tone: 'onset',
    text: `約${after(start)}分後に雨`,
    sub: `${mmh(start)} · 最大 ${mmh(peak)}`,
  }
}

export const RainAhead = memo(function RainAhead() {
  const { steps, isError, isPending } = useRainAhead()
  const h = steps.length ? headline(steps) : null
  const base = steps[0]

  return (
    <Panel code="R-01" title="RAIN NEXT 60" bodyClassName={s.body} meta={<span>JMA NOWCAST</span>}>
      {!base ? (
        <div className={s.pending}>
          {isError ? '■ NOWCAST UNAVAILABLE' : isPending ? '◐ ACQUIRING NOWCAST…' : 'NO DATA'}
        </div>
      ) : (
        <>
          <div className={s.head} data-tone={h?.tone}>
            <b className="ja">{h?.text}</b>
            {h?.sub && <span className="ja">{h.sub}</span>}
          </div>
          <div
            className={s.chart}
            role="img"
            aria-label={steps
              .map(
                (x) =>
                  `${formatTime(x.frame.validFrom, false)} ${x.level == null ? '不明' : x.level < 0 ? '降水なし' : `${x.label}ミリ`}`,
              )
              .join('、')}
          >
            {steps.map((x, i) => (
              <div
                key={x.frame.validFrom}
                className={s.col}
                data-observed={i === 0 || undefined}
                data-unknown={(!x.pending && x.level == null) || undefined}
              >
                <i
                  style={{
                    height: `${barHeight(x.level ?? -1)}%`,
                    background: (x.level ?? -1) >= 0 ? colorOf(x.level!) : undefined,
                  }}
                />
              </div>
            ))}
          </div>
          <div className={s.axis} aria-hidden="true">
            <span>{formatTime(base.frame.validFrom, false)}</span>
            <span>+15</span>
            <span>+30</span>
            <span>+45</span>
            <span>+60</span>
          </div>
          <div className={s.foot}>
            <QualityTags provenance={{ role: 'observed' }} />
            <span>先頭のみ観測</span>
            <QualityTags provenance={{ role: 'nowcast' }} />
            <span>5分毎の予測 · 地点の値</span>
          </div>
        </>
      )}
    </Panel>
  )
})
