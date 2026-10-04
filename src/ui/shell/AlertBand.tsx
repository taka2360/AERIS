import { memo, useMemo } from 'react'
import { intensityLabel } from '@/domain/earth/derive'
import {
  activeTsunami,
  quakeHeadline,
  quakeRelevance,
  tsunamiRelevance,
} from '@/domain/earth/status'
import { formatTime, minutesBetween } from '@/domain/time'
import { useQuakeEvents, useTsunami } from '@/query/earth-hooks'
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

const TSUNAMI_EN: Record<number, string> = {
  4: 'MAJOR TSUNAMI WARNING',
  3: 'TSUNAMI WARNING',
  2: 'TSUNAMI ADVISORY',
}

/**
 * Tsunami outranks every other band. Shown for advisories or warnings on the
 * coasts near the monitoring location, and for a major tsunami warning anywhere.
 */
function TsunamiBand() {
  const { assessments, localCodes } = useTsunami()
  const { now } = useTimeCursor()
  const { select } = useSelection()
  const rel = useMemo(
    () => tsunamiRelevance(activeTsunami(assessments, now), localCodes),
    [assessments, localCodes, now],
  )
  const local = rel.local.filter((a) => a.rank >= 2)
  const shown = local.length > 0 ? local : rel.national
  const top = shown[0]
  if (!top) return null
  const h =
    top.values?.maxHeightCondition ?? (top.values?.maxHeight ? `${top.values.maxHeight}m` : '')
  return (
    <div className={`${s.band} ${s.tsunami}`} data-rank={top.rank} role="alert">
      <span className={s.tag}>{TSUNAMI_EN[top.rank] ?? 'TSUNAMI'}</span>
      <span className={s.glyph} aria-hidden="true">
        ▲
      </span>
      <button
        type="button"
        className={`${s.list} ${s.link} ja`}
        onClick={() => top.eventRef && select(top.eventRef)}
      >
        {top.level.label} · {shown.map((a) => a.area.name).join('・')}
        {h && ` · 予想 ${h}`}
        {local.length > 0 ? ' · 監視地点の沿岸' : ' · 全国'}
      </button>
      {top.time.issuedAt && (
        <span className={s.time}>{formatTime(top.time.issuedAt, false)} 発表 · 気象庁</span>
      )}
    </div>
  )
}

/** Thin strips under the top bar for official alerts that concern the location. */
export const AlertBand = memo(function AlertBand() {
  return (
    <>
      <TsunamiBand />
      <QuakeBand />
      <JmaBand />
    </>
  )
})
