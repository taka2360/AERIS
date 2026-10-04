/**
 * E-01 — Event monitor: one line per observation domain with its AERIS
 * status word, the headline event and the age of the feed. The status is
 * an AERIS judgement; agencies' own levels appear in the detail panel.
 */
import { memo } from 'react'
import { SYSTEM_STATUS_LABEL } from '@/domain/earth/derive'
import { formatTime } from '@/domain/time'
import { useEarthSystems, type FeedState } from '@/query/earth-hooks'
import { useSelection } from '@/query/selection'
import { Panel } from '../primitives/Panel'
import { DataStateBadge, type DataState } from '../primitives/primitives'
import s from './EventMonitor.module.css'

const FEED_BADGE: Partial<Record<FeedState, DataState>> = {
  partial: 'partial',
  stale: 'stale',
  unavailable: 'unavailable',
}

export const EventMonitor = memo(function EventMonitor() {
  const systems = useEarthSystems()
  const { select } = useSelection()
  const statuses = systems.map((r) => r.reading.status)
  const tone = statuses.some((x) => x === 'critical' || x === 'warning')
    ? 'alert'
    : statuses.includes('elevated')
      ? 'caution'
      : 'default'

  return (
    <Panel code="E-01" title="EVENT MONITOR" tone={tone} meta={<span>AERIS ASSESSMENT</span>}>
      <ul className={s.list}>
        {systems.map((r) => {
          const badge = FEED_BADGE[r.feed]
          return (
            <li key={r.id} className={s.row} data-status={r.reading.status}>
              <span className={s.label}>{r.label}</span>
              <span className={s.status}>
                {r.feed === 'pending' ? 'LINKING' : SYSTEM_STATUS_LABEL[r.reading.status]}
              </span>
              {r.reading.headline && r.reading.eventId ? (
                <button
                  type="button"
                  className={`${s.headline} ja`}
                  onClick={() => select(r.reading.eventId!)}
                  title="詳細を表示"
                >
                  {r.reading.headline}
                </button>
              ) : (
                <span className={`${s.headline} ja`}>{r.reading.headline ?? ''}</span>
              )}
              <span className={s.meta}>
                {badge ? (
                  <DataStateBadge state={badge} />
                ) : (
                  <span title="最終確認時刻">
                    {r.checkedAt ? formatTime(r.checkedAt, false) : '--:--'}
                  </span>
                )}
                <span className={s.src}>{r.sources.join('/')}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className={s.note}>
        ※ 状態は AERIS 独自の判定です。各機関の発表は詳細パネルで確認できます。
      </p>
    </Panel>
  )
})
