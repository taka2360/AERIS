import { memo } from 'react'
import type { AlertSeverity } from '@/domain/model'
import { formatShortDate, formatTime } from '@/domain/time'
import { useAlerts } from '@/query/hooks'
import { Panel } from '../primitives/Panel'
import s from './JmaWarning.module.css'

export const SEVERITY_LABEL: Record<AlertSeverity, { ja: string; code: string; rank: number }> = {
  advisory: { ja: '注意報', code: 'ADV', rank: 1 },
  warning: { ja: '警報', code: 'WRN', rank: 2 },
  danger: { ja: '危険警報', code: 'DGR', rank: 3 },
  emergency: { ja: '特別警報', code: 'EMG', rank: 4 },
}

export const JmaWarning = memo(function JmaWarning() {
  const q = useAlerts()
  const bulletin = q.data?.data
  const active = bulletin?.alerts.filter((a) => a.status !== 'cancelled') ?? []
  const top = active.reduce<AlertSeverity | null>(
    (m, a) =>
      m == null || SEVERITY_LABEL[a.severity].rank > SEVERITY_LABEL[m].rank ? a.severity : m,
    null,
  )
  const tone = top === 'advisory' ? 'caution' : top ? 'alert' : 'default'
  const issued = bulletin?.provenance.issuedAt

  return (
    <Panel
      code="W-01"
      title="JMA WARNING SYSTEM"
      tone={tone}
      meta={
        issued ? (
          <span>
            ISSUED {formatShortDate(issued)} {formatTime(issued, false)}
          </span>
        ) : undefined
      }
    >
      {!bulletin ? (
        <div className={s.pending}>
          {q.isError || q.failureCount > 0
            ? '■ WARNING FEED UNAVAILABLE'
            : q.fetchStatus === 'idle'
              ? '○ AWAITING AREA CODE'
              : '◐ LINKING…'}
        </div>
      ) : (
        <>
          <div className={s.summary} data-level={top ?? 'none'}>
            <span className={s.summaryGlyph} aria-hidden="true">
              {top ? '▲' : '○'}
            </span>
            <span className={s.summaryWord}>
              {top ? `${SEVERITY_LABEL[top].ja} 発表中` : '発表なし'}
            </span>
            <span className={s.summaryCount}>
              {active.length > 0 ? `${String(active.length).padStart(2, '0')} ACTIVE` : 'CLEAR'}
            </span>
          </div>
          {active.length > 0 && (
            <ul className={s.list}>
              {active.map((a) => (
                <li key={a.id} className={s.item} data-severity={a.severity}>
                  <span className={s.badge}>{SEVERITY_LABEL[a.severity].ja}</span>
                  <span className={`${s.name} ja`}>{a.name}</span>
                  {a.level != null && <span className={s.level}>LV{a.level}</span>}
                  <span className={s.status}>{a.status === 'continued' ? 'CONT' : 'NEW'}</span>
                </li>
              ))}
            </ul>
          )}
          {bulletin.headline && <p className={`${s.headline} ja`}>{bulletin.headline}</p>}
          <div className={s.foot}>
            <span className="ja">{bulletin.areaName}</span> · 気象庁発表 · OFFICIAL
          </div>
        </>
      )}
    </Panel>
  )
})
