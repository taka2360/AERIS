/**
 * E-02 — Event log: every natural event known to the terminal, newest first.
 * While the time cursor is scrubbed, only events that had happened by t are
 * listed (nothing from "the future" of the shown moment).
 */
import { memo, useMemo, useState } from 'react'
import type { EventCategory, NaturalEvent } from '@/domain/earth/events'
import { eventSeverity } from '@/domain/earth/derive'
import { epoch, formatShortDate, formatTime } from '@/domain/time'
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

function inJapan(e: NaturalEvent): boolean {
  if (e.geometry.type !== 'Point') return false
  const [lon, lat] = e.geometry.coordinates
  return lon >= 120 && lon <= 156 && lat >= 20 && lat <= 50
}

export const EventLog = memo(function EventLog() {
  const { events } = useNaturalEvents()
  const cursor = useTimeCursor()
  const { selectedId, select } = useSelection()
  const [scope, setScope] = useState<Scope>('all')
  const [category, setCategory] = useState<EventCategory | 'all'>('all')

  const categories = useMemo(() => [...new Set(events.map((e) => e.category))], [events])
  const rows = useMemo(() => {
    const t = epoch(cursor.t)
    return events
      .filter((e) => {
        const at = eventTime(e)
        return !at || epoch(at) <= t
      })
      .filter((e) => category === 'all' || e.category === category)
      .filter((e) => scope === 'all' || (scope === 'japan') === inJapan(e))
      .slice(0, MAX_ROWS)
  }, [events, cursor.t, category, scope])

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
      {rows.length === 0 ? (
        <div className={s.empty}>○ NO EVENTS IN VIEW</div>
      ) : (
        <table className={s.table}>
          <caption className="visually-hidden">自然現象の一覧(新しい順)</caption>
          <thead>
            <tr>
              <th scope="col">TIME (JST)</th>
              <th scope="col">AGE</th>
              <th scope="col">TYPE</th>
              <th scope="col">LOCATION</th>
              <th scope="col">FIGURE</th>
              <th scope="col">SRC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const at = eventTime(e)
              return (
                <tr
                  key={e.id}
                  data-selected={selectedId === e.id || undefined}
                  data-severity={eventSeverity(e).value}
                  data-cancelled={e.lifecycle === 'cancelled' || undefined}
                >
                  <td className={s.time}>
                    {at ? `${formatShortDate(at)} ${formatTime(at, false)}` : '--'}
                  </td>
                  <td className={s.age}>{ageLabel(cursor.now, at)}</td>
                  <td>
                    <span className={s.tag} data-category={e.category}>
                      {CATEGORY_TAG[e.category]}
                    </span>
                  </td>
                  <td className={s.place}>
                    <button type="button" className={`${s.select} ja`} onClick={() => select(e.id)}>
                      {e.title}
                    </button>
                  </td>
                  <td className={s.figure}>{eventFigure(e)}</td>
                  <td className={s.src}>
                    {sourceTags(e).join('+')}
                    <QualityTags
                      provenance={
                        e.provenance.quality === 'preliminary'
                          ? { ...e.provenance, role: undefined, derivation: undefined }
                          : undefined
                      }
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Panel>
  )
})
