/**
 * E-03 — Event detail. Shows each source's own values side by side (JMA Mj
 * next to USGS Mw, each with its provenance), the agency's native levels,
 * and — clearly separated — AERIS's derived judgement and its rule.
 */
import { memo, useMemo } from 'react'
import { haversineKm } from '@/domain/derive'
import { intensityLabel, intensityRank, quakeSeverity } from '@/domain/earth/derive'
import type { EarthquakeEvent, NaturalEvent } from '@/domain/earth/events'
import { quakeRelevance } from '@/domain/earth/status'
import { formatDate, formatTime } from '@/domain/time'
import {
  useEarthSystems,
  useNaturalEvents,
  useQuakeDetail,
  useQuakeEvents,
} from '@/query/earth-hooks'
import { useResolvedLocation } from '@/query/hooks'
import { useSelection } from '@/query/selection'
import { Panel } from '../primitives/Panel'
import { QualityTags } from '../primitives/primitives'
import { ageLabel, CATEGORY_JA, CATEGORY_TAG, eventTime, sourceTags } from './event-format'
import s from './EventDetail.module.css'

const SEVERITY_JA = {
  none: '影響なし',
  minor: '軽微',
  moderate: '中程度',
  severe: '大きい',
  extreme: '甚大',
} as const

function QuakeDetail({ e }: { e: EarthquakeEvent }) {
  const detail = useQuakeDetail(e)
  const { associations } = useQuakeEvents()
  const { location } = useResolvedLocation()
  const stations = detail.data?.data.stations?.length
    ? detail.data.data.stations
    : e.detail.stations
  const comments = detail.data?.data.comments?.length
    ? detail.data.data.comments
    : e.detail.comments
  const withStations = useMemo(() => ({ ...e, detail: { ...e.detail, stations } }), [e, stations])
  const sev = quakeSeverity(withStations)
  const rel = quakeRelevance(withStations, location)
  const assoc = associations.filter(
    (a) =>
      e.sources.some((s) => s.nativeId === a.a.nativeId) ||
      e.sources.some((s) => s.nativeId === a.b.nativeId),
  )
  const top = [...stations]
    .sort((a, b) => intensityRank(b.intensity) - intensityRank(a.intensity))
    .slice(0, 10)
  const h = e.detail.hypocenter

  return (
    <>
      <dl className={s.grid}>
        <dt>EPICENTRE</dt>
        <dd>
          {h.lat.toFixed(2)}°{h.lat >= 0 ? 'N' : 'S'} {Math.abs(h.lon).toFixed(2)}°
          {h.lon >= 0 ? 'E' : 'W'}
          <span className={s.src}>
            {e.fieldSources?.hypocenter?.sources.map((x) => x.source).join(', ')}
          </span>
        </dd>
        <dt>DEPTH</dt>
        <dd>{h.depthKm == null ? '不明' : h.depthKm === 0 ? 'ごく浅い' : `${h.depthKm} km`}</dd>
        <dt>MAGNITUDE</dt>
        <dd className={s.measures}>
          {e.measures
            .filter((m) => m.kind === 'earthquake.magnitude')
            .map((m) => (
              <span key={`${m.provenance.source}-${m.variant}`} className={s.measure}>
                <b>
                  {m.variant === 'mww' ? 'Mw' : m.variant} {m.value.toFixed(1)}
                </b>
                <span className={s.src}>{m.provenance.label ?? m.provenance.source}</span>
                <QualityTags
                  provenance={{ ...m.provenance, role: undefined, derivation: undefined }}
                />
              </span>
            ))}
        </dd>
        <dt>MAX INTENSITY</dt>
        <dd>
          {e.detail.maxIntensity ? (
            <>
              <b className={s.intensity} data-rank={intensityRank(e.detail.maxIntensity)}>
                震度{intensityLabel(e.detail.maxIntensity)}
              </b>
              <span className={s.src}>気象庁 観測</span>
            </>
          ) : (
            <span className={s.dim}>JMA 震度なし</span>
          )}
        </dd>
      </dl>

      <div className={s.derived}>
        <span className={s.derivedTag}>AERIS 判定</span>
        <span>
          影響度 <b>{SEVERITY_JA[sev.value]}</b>
        </span>
        <span>
          監視地点 {rel.distanceKm}km ·{' '}
          {rel.affectsLocation ? (
            <b className={s.local}>付近で震度{intensityLabel(rel.nativeLevel)}観測</b>
          ) : (
            '付近で震度4以上の観測なし'
          )}
        </span>
        <span className={s.rule} title="判定ルール">
          {sev.derivedFrom.method} v{sev.derivedFrom.version}
        </span>
      </div>

      {top.length > 0 && (
        <table className={s.stations}>
          <caption>観測点の震度(上位{top.length}) · 気象庁</caption>
          <tbody>
            {top.map((st) => (
              <tr key={st.code}>
                <th scope="row" className="ja">
                  {st.name}
                </th>
                <td className={s.intensity} data-rank={intensityRank(st.intensity)}>
                  {intensityLabel(st.intensity)}
                </td>
                <td className={s.dim}>
                  {Math.round(haversineKm(location.lat, location.lon, st.lat, st.lon))}km
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {detail.isFetching && !detail.data && <div className={s.dim}>◐ 震度観測点を取得中…</div>}
      {comments.map((c) => (
        <p key={c} className={`${s.comment} ja`}>
          {c}
        </p>
      ))}

      {assoc.length > 0 && (
        <details className={s.assoc}>
          <summary>SOURCE ASSOCIATION ({assoc.length})</summary>
          <ul>
            {assoc.map((a) => (
              <li key={`${a.a.nativeId}-${a.b.nativeId}`}>
                {a.relation === 'same-event' ? 'ASSOCIATED' : 'RELATED'} · conf{' '}
                {a.confidence.toFixed(2)} · Δt {a.evidence.timeDeltaSec}s · Δd{' '}
                {a.evidence.distanceKm}km
                {a.evidence.depthDeltaKm != null && ` · Δz ${a.evidence.depthDeltaKm}km`}
                {a.evidence.magnitudeDelta != null && ` · ΔM ${a.evidence.magnitudeDelta}`}
                {a.evidence.ambiguous && ' · AMBIGUOUS'} · {a.method}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function Body({ e, auto }: { e: NaturalEvent; auto: boolean }) {
  const { now } = useNaturalEvents()
  const at = eventTime(e)
  return (
    <>
      <div className={s.head}>
        <span className={s.tag}>{CATEGORY_TAG[e.category]}</span>
        <h3 className={`${s.title} ja`}>{e.title}</h3>
        {auto && <span className={s.auto}>AUTO</span>}
      </div>
      <div className={s.when}>
        {at ? `${formatDate(at)} ${formatTime(at)} JST` : '--'} · {ageLabel(now, at)} ·{' '}
        <span className="ja">{CATEGORY_JA[e.category]}</span> · {sourceTags(e).join(' + ')}
        {e.lifecycle === 'cancelled' && <b className={s.cancel}> · 取消</b>}
      </div>
      {e.category === 'earthquake' && <QuakeDetail e={e} />}
    </>
  )
}

export const EventDetail = memo(function EventDetail() {
  const { selectedId, select } = useSelection()
  const { events } = useNaturalEvents()
  const systems = useEarthSystems()
  // Nothing picked: show the event behind the most severe domain headline.
  const autoId = systems.find((r) => r.reading.eventId)?.reading.eventId
  const picked = events.find((e) => e.id === selectedId)
  const shown = picked ?? events.find((e) => e.id === autoId)

  return (
    <Panel
      code="E-03"
      title="EVENT DETAIL"
      bodyClassName={s.body}
      meta={
        picked ? (
          <button type="button" className={s.clear} onClick={() => select(null)}>
            ✕ CLEAR
          </button>
        ) : undefined
      }
    >
      {shown ? <Body e={shown} auto={!picked} /> : <div className={s.dim}>○ NO EVENT SELECTED</div>}
    </Panel>
  )
})
