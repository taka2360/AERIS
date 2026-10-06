/**
 * E-02 — Event log: every natural event known to the terminal, newest first.
 * While the time cursor is scrubbed, only events that had happened by t are
 * listed (nothing from "the future" of the shown moment).
 * An activity strip over the past week sits above the list; the list itself is
 * grouped by JST day.
 */
import { memo, useMemo, useState } from 'react'
import type { EventCategory, NaturalEvent } from '@/domain/earth/events'
import { eventSeverity } from '@/domain/earth/derive'
import {
  dateKeyToInstant,
  epoch,
  formatShortDate,
  formatTime,
  formatWeekday,
  jstDateKey,
  toInstant,
  type Instant,
} from '@/domain/time'
import { useNaturalEvents } from '@/query/earth-hooks'
import { useSelection } from '@/query/selection'
import { useTimeCursor } from '@/query/time-cursor'
import { Panel } from '../primitives/Panel'
import { QualityTags } from '../primitives/primitives'
import { ageLabel, CATEGORY_TAG, eventFigure, eventTime, sourceTags } from './event-format'
import s from './EventLog.module.css'

type Scope = 'all' | 'japan' | 'world'
const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: 'all', label: 'ALL' },
  { id: 'japan', label: 'JAPAN' },
  { id: 'world', label: 'WORLD' },
]
const MAX_ROWS = 80
/** Activity strip: the past 7 days in 6-hour bins */
const STRIP_DAYS = 7
const BIN_H = 6
const SEV_ORDER = ['none', 'minor', 'moderate', 'severe', 'extreme'] as const
type Sev = (typeof SEV_ORDER)[number]

function inJapan(e: NaturalEvent): boolean {
  if (e.geometry.type !== 'Point') return false
  const [lon, lat] = e.geometry.coordinates
  return lon >= 120 && lon <= 156 && lat >= 20 && lat <= 50
}

const worse = (a: Sev, b: Sev): Sev => (SEV_ORDER.indexOf(a) >= SEV_ORDER.indexOf(b) ? a : b)

type Bin = { count: number; sev: Sev }

/** Event counts per bin over the strip window ending at `end`. */
function activityBins(rows: NaturalEvent[], end: Instant): Bin[] {
  const n = (STRIP_DAYS * 24) / BIN_H
  const bins: Bin[] = Array.from({ length: n }, () => ({ count: 0, sev: 'none' }))
  const endMs = epoch(end)
  const binMs = BIN_H * 3_600_000
  for (const e of rows) {
    const at = eventTime(e)
    if (!at) continue
    const i = n - 1 - Math.floor((endMs - epoch(at)) / binMs)
    const bin = bins[i]
    if (!bin) continue
    bin.count += 1
    bin.sev = worse(bin.sev, eventSeverity(e).value)
  }
  return bins
}

function ActivityStrip({ rows, end }: { rows: NaturalEvent[]; end: Instant }) {
  const bins = useMemo(() => activityBins(rows, end), [rows, end])
  const max = Math.max(1, ...bins.map((b) => b.count))
  const total = bins.reduce((a, b) => a + b.count, 0)
  const last24 = bins.slice(-24 / BIN_H).reduce((a, b) => a + b.count, 0)
  const severe = rows.filter((e) => ['severe', 'extreme'].includes(eventSeverity(e).value)).length
  // Day ticks: midnight JST of each day in the window, as a fraction of it.
  const endMs = epoch(end)
  const spanMs = STRIP_DAYS * 86_400_000
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => {
    const ms = endMs - i * 86_400_000
    const midnight = epoch(dateKeyToInstant(jstDateKey(toInstant(ms))))
    return { ms: midnight, frac: (midnight - (endMs - spanMs)) / spanMs }
  }).filter((d) => d.frac > 0.02 && d.frac < 0.98)

  return (
    <div className={s.strip}>
      <div className={s.stats}>
        <span>
          <b>{rows.length}</b> IN VIEW
        </span>
        <span>
          <b>{last24}</b> 24H
        </span>
        <span>
          <b>{total}</b> 7D
        </span>
        <span data-sev={severe > 0 ? 'severe' : undefined}>
          <b>{severe}</b> SEVERE
        </span>
      </div>
      <div
        className={s.histo}
        role="img"
        aria-label={`過去7日間の発生件数 ${total}件(うち直近24時間 ${last24}件)`}
      >
        {bins.map((b, i) => (
          <i
            key={i}
            data-sev={b.count ? b.sev : undefined}
            style={{ height: b.count ? `${18 + (b.count / max) * 82}%` : undefined }}
          />
        ))}
        {days.map((d) => (
          <span key={d.ms} className={s.dayTick} style={{ left: `${d.frac * 100}%` }}>
            {formatShortDate(toInstant(d.ms))}
          </span>
        ))}
      </div>
    </div>
  )
}

export const EventLog = memo(function EventLog() {
  const { events } = useNaturalEvents()
  const cursor = useTimeCursor()
  const { selectedId, select } = useSelection()
  const [scope, setScope] = useState<Scope>('all')
  const [category, setCategory] = useState<EventCategory | 'all'>('all')

  const categories = useMemo(() => [...new Set(events.map((e) => e.category))], [events])
  const filtered = useMemo(() => {
    const t = epoch(cursor.t)
    return events
      .filter((e) => {
        const at = eventTime(e)
        return !at || epoch(at) <= t
      })
      .filter((e) => category === 'all' || e.category === category)
      .filter((e) => scope === 'all' || (scope === 'japan') === inJapan(e))
  }, [events, cursor.t, category, scope])
  const rows = filtered.slice(0, MAX_ROWS)

  // Consecutive rows of one JST day share a header (rows are newest first).
  const groups = useMemo(() => {
    const out: Array<{ key: string; at: Instant | undefined; rows: NaturalEvent[] }> = []
    for (const e of rows) {
      const at = eventTime(e)
      const key = at ? jstDateKey(at) : 'undated'
      const last = out.at(-1)
      if (last && last.key === key) last.rows.push(e)
      else out.push({ key, at, rows: [e] })
    }
    return out
  }, [rows])

  return (
    <Panel
      code="E-02"
      title="EVENT LOG"
      bodyClassName={s.body}
      meta={
        <>
          <div className={s.chips} role="group" aria-label="地域">
            {SCOPES.map((x) => (
              <button
                key={x.id}
                type="button"
                className={s.chip}
                aria-pressed={scope === x.id}
                onClick={() => setScope(x.id)}
              >
                {x.label}
              </button>
            ))}
          </div>
          {categories.length > 1 && (
            <div className={s.chips} role="group" aria-label="種別">
              <button
                type="button"
                className={s.chip}
                aria-pressed={category === 'all'}
                onClick={() => setCategory('all')}
              >
                ANY
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={s.chip}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {CATEGORY_TAG[c]}
                </button>
              ))}
            </div>
          )}
        </>
      }
    >
      <ActivityStrip rows={filtered} end={cursor.t} />
      {rows.length === 0 ? (
        <div className={s.empty}>○ NO EVENTS IN VIEW</div>
      ) : (
        <div className={s.list}>
          {groups.map((g) => (
            <section
              key={g.key}
              className={s.day}
              aria-label={g.at ? jstDateKey(g.at) : '日時不明'}
            >
              <h3 className={s.dayHead}>
                <span>{g.at ? `${formatShortDate(g.at)} ${formatWeekday(g.at)}` : 'UNDATED'}</span>
                <i aria-hidden="true" />
                <span className={s.dayCount}>{String(g.rows.length).padStart(2, '0')}</span>
              </h3>
              <ol className={s.rows}>
                {g.rows.map((e) => {
                  const at = eventTime(e)
                  const sev = eventSeverity(e).value
                  return (
                    <li
                      key={e.id}
                      className={s.row}
                      data-selected={selectedId === e.id || undefined}
                      data-severity={sev}
                      data-cancelled={e.lifecycle === 'cancelled' || undefined}
                    >
                      <button
                        type="button"
                        className={s.select}
                        aria-pressed={selectedId === e.id}
                        onClick={() => select(e.id)}
                      >
                        <span className={s.when}>
                          <span className={s.time}>{at ? formatTime(at, false) : '--:--'}</span>
                          <span className={s.age}>{ageLabel(cursor.now, at)}</span>
                        </span>
                        <span className={s.tag} data-category={e.category}>
                          {CATEGORY_TAG[e.category]}
                        </span>
                        <span className={s.what}>
                          <span className={`${s.title} ja`}>{e.title}</span>
                          <span className={s.src}>
                            {sourceTags(e).join(' + ')}
                            <QualityTags
                              provenance={
                                e.provenance.quality === 'preliminary'
                                  ? { ...e.provenance, role: undefined, derivation: undefined }
                                  : undefined
                              }
                            />
                          </span>
                        </span>
                        <span className={`${s.figure} ja`}>{eventFigure(e)}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Panel>
  )
})
