import { memo, useMemo } from 'react'
import { intensityLabel } from '@/domain/earth/derive'
import { quakeHeadline, quakeRelevance } from '@/domain/earth/status'
import { formatTime, minutesBetween } from '@/domain/time'
import { useQuakeEvents } from '@/query/earth-hooks'
import { useAlerts, useResolvedLocation } from '@/query/hooks'
import { useSelection } from '@/query/selection'
import { useTimeCursor } from '@/query/time-cursor'
import s from './AlertBand.module.css'

const RANK = { advisory: 1, warning: 2, danger: 3, emergency: 4 } as const

/** Earthquakes stay in the band this long after strong local shaking. */
const QUAKE_BAND_MIN = 60

function JmaBand() {
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
}

/**
 * Only earthquakes that shook the monitoring location (JMA intensity 4+ at a
 * station within 30 km) reach the band; distant ones stay in the event panels.
 */
function QuakeBand() {
  const { events } = useQuakeEvents()
  const { location } = useResolvedLocation()
  const { now } = useTimeCursor()
  const { select } = useSelection()
  const hit = useMemo(
    () =>
      events
        .filter((e) => {
          const age = minutesBetween(e.time.startedAt ?? now, now)
          return e.lifecycle !== 'cancelled' && age >= 0 && age <= QUAKE_BAND_MIN
        })
        .map((e) => ({ e, p: quakeRelevance(e, location) }))
        .find((x) => x.p.affectsLocation),
    [events, location, now],
  )
  if (!hit) return null
  return (
    <div className={s.band} data-severity="warning" role="status">
      <span className={s.tag}>EQ</span>
      <span className={s.glyph} aria-hidden="true">
        ▲
      </span>
      <button type="button" className={`${s.list} ${s.link} ja`} onClick={() => select(hit.e.id)}>
        地震 監視地点付近で震度{intensityLabel(hit.p.nativeLevel)}を観測 · {quakeHeadline(hit.e)}
      </button>
      {hit.e.time.startedAt && (
        <span className={s.time}>{formatTime(hit.e.time.startedAt, false)} 発生 · 気象庁</span>
      )}
    </div>
  )
}

/** Thin strips under the top bar for official alerts that concern the location. */
export const AlertBand = memo(function AlertBand() {
  return (
    <>
      <QuakeBand />
      <JmaBand />
    </>
  )
})
