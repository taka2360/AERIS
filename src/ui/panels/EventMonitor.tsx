/**
 * E-01 — Event monitor: every observation domain with its AERIS status word,
 * the headline event and the age of the feed. The status is an AERIS
 * judgement; agencies' own levels appear in the detail panel.
 *
 * Layout: a status distribution bar on top; domains that need attention as
 * full rows, most severe first; quiet (NOMINAL) domains folded into compact
 * tiles below so they stay visible without taking the panel.
 */
import { memo } from 'react'
import { SYSTEM_STATUS_LABEL, SYSTEM_STATUS_RANK } from '@/domain/earth/derive'
import type { SystemStatus } from '@/domain/earth/derive'
import { formatTime } from '@/domain/time'
import { useEarthSystems, type FeedState, type SystemRow } from '@/query/earth-hooks'
import { useSelection } from '@/query/selection'
import { Panel } from '../primitives/Panel'
import { DataStateBadge, type DataState } from '../primitives/primitives'
import s from './EventMonitor.module.css'

const FEED_BADGE: Partial<Record<FeedState, DataState>> = {
  partial: 'partial',
  stale: 'stale',
  unavailable: 'unavailable',
}

/** Bar segments, most severe first. */
const ORDER: SystemStatus[] = ['critical', 'warning', 'elevated', 'active', 'nominal', 'unknown']

const statusOf = (r: SystemRow): SystemStatus | 'pending' =>
  r.feed === 'pending' ? 'pending' : r.reading.status

function Meta({ r }: { r: SystemRow }) {
  const badge = FEED_BADGE[r.feed]
  return (
    <span className={s.meta}>
      {badge ? (
        <DataStateBadge state={badge} />
      ) : (
        <span title="最終確認時刻">{r.checkedAt ? formatTime(r.checkedAt, false) : '--:--'}</span>
      )}
      <span className={s.src}>{r.sources.join('/')}</span>
    </span>
  )
}

function Headline({ r, select }: { r: SystemRow; select: (id: string) => void }) {
  const text = r.reading.headline ?? ''
  return r.reading.headline && r.reading.eventId ? (
    <button
      type="button"
      className={`${s.headline} ja`}
      onClick={() => select(r.reading.eventId!)}
      title="詳細を表示"
    >
      {text}
      <span className={s.chevron} aria-hidden="true">
        ›
      </span>
    </button>
  ) : (
    <span className={`${s.headline} ja`}>{text}</span>
  )
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

  // Stable sort: equal statuses keep the domain order.
  const loud = systems
    .filter((r) => r.feed !== 'pending' && SYSTEM_STATUS_RANK[r.reading.status] > 0)
    .sort((a, b) => SYSTEM_STATUS_RANK[b.reading.status] - SYSTEM_STATUS_RANK[a.reading.status])
  const quiet = systems.filter((r) => !loud.includes(r))
  const counts = ORDER.map((st) => ({
    st,
    n: systems.filter((r) => r.feed !== 'pending' && r.reading.status === st).length,
  })).filter((c) => c.n > 0)

  return (
    <Panel
      code="E-01"
      title="EVENT MONITOR"
      tone={tone}
      bodyClassName={s.body}
      meta={<span>AERIS ASSESSMENT</span>}
    >
      <div className={s.summary} aria-label="状態の内訳">
        <div className={s.bar} aria-hidden="true">
          {counts.map((c) => (
            <i key={c.st} data-status={c.st} style={{ flexGrow: c.n }} />
          ))}
        </div>
        <div className={s.counts}>
          {counts.map((c) => (
            <span key={c.st} data-status={c.st}>
              <b>{String(c.n).padStart(2, '0')}</b> {SYSTEM_STATUS_LABEL[c.st]}
            </span>
          ))}
        </div>
      </div>

      {loud.length > 0 && (
        <ul className={s.list} aria-label="注意が必要な領域">
          {loud.map((r) => (
            <li key={r.id} className={s.row} data-status={statusOf(r)}>
              <span className={s.label}>{r.label}</span>
              <span className={s.status}>{SYSTEM_STATUS_LABEL[r.reading.status]}</span>
              <Meta r={r} />
              <Headline r={r} select={select} />
            </li>
          ))}
        </ul>
      )}

      {quiet.length > 0 && (
        <ul className={s.tiles} aria-label="平常の領域">
          {quiet.map((r) => (
            <li key={r.id} className={s.tile} data-status={statusOf(r)}>
              <span className={s.tileHead}>
                <span className={s.lamp} aria-hidden="true" />
                <span className={s.label}>{r.label}</span>
                <span className={s.tileStatus}>
                  {r.feed === 'pending' ? 'LINKING' : SYSTEM_STATUS_LABEL[r.reading.status]}
                </span>
              </span>
              <Headline r={r} select={select} />
              {FEED_BADGE[r.feed] && <DataStateBadge state={FEED_BADGE[r.feed]!} />}
            </li>
          ))}
        </ul>
      )}

      <p className={s.note}>
        ※ 状態は AERIS 独自の判定です。各機関の発表は詳細パネルで確認できます。
      </p>
    </Panel>
  )
})
