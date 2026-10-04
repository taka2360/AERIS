import { memo } from 'react'
import { formatTime } from '@/domain/time'
import { useAlerts } from '@/query/hooks'
import s from './AlertBand.module.css'

const RANK = { advisory: 1, warning: 2, danger: 3, emergency: 4 } as const

/** Thin strip under the top bar while any official JMA alert is active. */
export const AlertBand = memo(function AlertBand() {
  const q = useAlerts()
  const b = q.data?.data
  const active = b?.alerts.filter((a) => a.status !== 'cancelled') ?? []
  if (!b || active.length === 0) return null
  const top = active.reduce((m, a) => (RANK[a.severity] > RANK[m.severity] ? a : m))
  return (
    <div className={s.band} data-severity={top.severity} role="status">
      <span className={s.tag}>JMA</span>
      <span className={s.glyph} aria-hidden="true">
        ▲
      </span>
      <span className={`${s.list} ja`}>{active.map((a) => a.name).join(' · ')}</span>
      <span className={`${s.area} ja`}>{b.areaName}</span>
      {b.provenance.issuedAt && (
        <span className={s.time}>{formatTime(b.provenance.issuedAt, false)} 発表</span>
      )}
    </div>
  )
})
