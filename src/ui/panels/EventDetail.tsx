/**
 * E-03 — Event detail. Shows each source's own values side by side (JMA Mj
 * next to USGS Mw, each with its provenance), the agency's native levels,
 * and — clearly separated — AERIS's derived judgement and its rule.
 */
import { Fragment, memo, useMemo } from 'react'
import { haversineKm } from '@/domain/derive'
import { intensityLabel, intensityRank, quakeSeverity } from '@/domain/earth/derive'
import type {
  CycloneEvent,
  EarthquakeEvent,
  NaturalEvent,
  TsunamiEvent,
  VolcanoEvent,
  VolcanoSite,
} from '@/domain/earth/events'
import { cycloneProximity, quakeRelevance } from '@/domain/earth/status'
import { formatDate, formatTime } from '@/domain/time'
import {
  useTsunami,
  useVolcanoes,
  useGdacsLinks,
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
  const { events } = useNaturalEvents()
  const gdacs = useGdacsLinks(events).get(e.id) ?? []
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

      {gdacs.length > 0 && (
        <div className={s.derived}>
          <span className={s.derivedTag}>GDACS ASSESSMENT</span>
          {gdacs.map((g) => (
            <b key={g.id}>{g.level.label}</b>
          ))}
          <span className={s.rule}>人的影響の評価 · 観測ではない</span>
        </div>
      )}
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

function TsunamiDetail({ e }: { e: TsunamiEvent }) {
  const { assessments, localCodes } = useTsunami()
  const { select } = useSelection()
  const mine = assessments
    .filter((a) => a.eventRef === e.id)
    .sort((a, b) => b.rank - a.rank || (a.area.code ?? '').localeCompare(b.area.code ?? ''))
  const origin = e.detail.originEventRef
  return (
    <>
      {e.detail.headline && <p className={`${s.comment} ja`}>{e.detail.headline}</p>}
      <table className={s.stations}>
        <caption>津波予報区ごとの発表 · 気象庁(予測)</caption>
        <thead>
          <tr>
            <th scope="col">予報区</th>
            <th scope="col">区分</th>
            <th scope="col">予想高さ</th>
            <th scope="col">第1波</th>
          </tr>
        </thead>
        <tbody>
          {mine.map((a) => (
            <tr key={a.id} data-local={localCodes.includes(a.area.code ?? '') || undefined}>
              <th scope="row" className="ja">
                {a.area.name}
                {localCodes.includes(a.area.code ?? '') && (
                  <span className={s.localTag}>監視地点</span>
                )}
              </th>
              <td className={s.tsuClass} data-rank={a.status === 'cancelled' ? 0 : a.rank}>
                {a.status === 'cancelled' ? `${a.level.label}(解除)` : a.level.label}
              </td>
              <td>
                {a.values?.maxHeightCondition ??
                  (a.values?.maxHeight ? `${a.values.maxHeight}m` : '--')}
              </td>
              <td className={s.dim}>
                {a.values?.firstArrivalCondition
                  ? String(a.values.firstArrivalCondition)
                  : a.values?.firstArrival
                    ? `${formatTime(String(a.values.firstArrival), false)} 予想`
                    : '--'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {e.detail.observations.length > 0 && (
        <table className={s.stations}>
          <caption>沿岸の観測値 · 気象庁(観測)</caption>
          <tbody>
            {e.detail.observations.map((o) => (
              <tr key={o.station}>
                <th scope="row" className="ja">
                  {o.station}
                </th>
                <td>{o.maxHeightM != null ? `${o.maxHeightM}m` : '--'}</td>
                <td className={s.dim}>
                  {o.arrivalAt ? `${formatTime(o.arrivalAt, false)} 到達` : ''} {o.condition ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {origin && (
        <button type="button" className={s.clear} onClick={() => select(origin)}>
          → 発生源の地震
        </button>
      )}
    </>
  )
}

function CycloneDetail({ e }: { e: CycloneEvent }) {
  const { location } = useResolvedLocation()
  const d = e.detail
  const a = d.observedPosition
  const px = cycloneProximity(e, location)
  const issue = d.forecasts.at(-1)
  const m = (k: string) => e.measures.find((x) => x.kind === k)
  return (
    <>
      <dl className={s.grid}>
        <dt>CLASS</dt>
        <dd className="ja">
          {[d.categoryLabel, d.sizeClass, d.intensityClass].filter(Boolean).join(' · ') || '--'}
          <span className={s.src}>気象庁 階級</span>
        </dd>
        <dt>CENTRE</dt>
        <dd>
          {a ? `${a.lat.toFixed(1)}°N ${a.lon.toFixed(1)}°E` : '--'}
          <span className={`${s.src} ja`}>{e.place}</span>
          <QualityTags provenance={e.provenance} />
        </dd>
        <dt>PRESSURE</dt>
        <dd>{m('cyclone.central_pressure')?.value ?? '--'} hPa</dd>
        <dt>MAX WIND</dt>
        <dd>
          {m('cyclone.max_wind')?.value ?? '--'} m/s · 最大瞬間{' '}
          {m('cyclone.max_gust')?.value ?? '--'} m/s
        </dd>
        <dt>MOVEMENT</dt>
        <dd className="ja">
          {d.movement?.directionText ?? '--'}{' '}
          {d.movement?.speedKmh != null ? `${d.movement.speedKmh} km/h` : ''}
        </dd>
        <dt>AREAS</dt>
        <dd>
          暴風域 {a?.stormAreaKm != null ? `${a.stormAreaKm}km` : 'なし'} · 強風域{' '}
          {d.galeArea ? `${d.galeArea.radiusKm}km` : 'なし'}
        </dd>
      </dl>
      {px && (
        <div className={s.derived}>
          <span className={s.derivedTag}>AERIS 判定</span>
          <span>監視地点まで {px.distanceKm.toLocaleString('en-US')}km</span>
          <span>
            {px.inStormArea ? (
              <b className={s.local}>暴風域内</b>
            ) : px.inGaleArea ? (
              <b className={s.local}>強風域内</b>
            ) : px.inForecastStormArea ? (
              <b className={s.local}>予報の暴風警戒域にかかる</b>
            ) : (
              '暴風・強風域外'
            )}
          </span>
          <span className={s.rule}>aeris:cyclone-status v1</span>
        </div>
      )}
      {issue && (
        <table className={s.stations}>
          <caption>予報 · {formatTime(issue.issuedAt, false)} 発表 · 気象庁(予測)</caption>
          <thead>
            <tr>
              <th scope="col">TIME</th>
              <th scope="col">POSITION</th>
              <th scope="col">hPa</th>
              <th scope="col">m/s</th>
              <th scope="col">予報円</th>
            </tr>
          </thead>
          <tbody>
            {issue.points.map((p) => (
              <tr key={p.validAt}>
                <th scope="row">
                  {formatTime(p.validAt, false)}{' '}
                  <small className={s.dim}>{p.role === 'forecast' ? 'FCST' : 'ANL'}</small>
                </th>
                <td>
                  {p.lat.toFixed(1)}N {p.lon.toFixed(1)}E
                </td>
                <td>{p.pressureHpa ?? '--'}</td>
                <td>{p.maxWindMs ?? '--'}</td>
                <td className={s.dim}>{p.circleKm ? `${p.circleKm}km` : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

/** JMA's volcano activity page for a volcano code. */
const jmaVolcanoUrl = (code: string) =>
  `https://www.data.jma.go.jp/vois/data/tokyo/STOCK/activity_info/${code}.html`

function VolcanoDetail({ e }: { e: VolcanoEvent }) {
  const d = e.detail
  return (
    <>
      <dl className={s.grid}>
        <dt>BULLETIN</dt>
        <dd className="ja">
          <b className={s.tsuClass} data-rank={Math.min(4, d.alertLevel ?? 2)}>
            {d.levelName}
          </b>
          {d.condition && <span className={s.src}>{d.condition}</span>}
          <span className={s.src}>気象庁 噴火警報・予報</span>
        </dd>
        <dt>ISSUED</dt>
        <dd>
          {e.time.issuedAt
            ? `${formatDate(e.time.issuedAt)} ${formatTime(e.time.issuedAt, false)} JST`
            : '--'}
        </dd>
        <dt>ALERT LEVEL</dt>
        <dd>
          {d.alertLevel != null ? `噴火警戒レベル ${d.alertLevel}` : 'レベル制の対象外の発表'}
        </dd>
      </dl>
      {d.notes.length > 0 && (
        <ul className={`${s.notes} ja`}>
          {d.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <a className={s.ext} href={jmaVolcanoUrl(d.volcanoCode)} target="_blank" rel="noreferrer">
        気象庁 火山の活動状況 ↗
      </a>
    </>
  )
}

function VolcanoSiteDetail({ site }: { site: VolcanoSite }) {
  const { query } = useVolcanoes()
  return (
    <>
      <div className={s.head}>
        <span className={s.tag}>VOLC</span>
        <h3 className={`${s.title} ja`}>{site.name}</h3>
      </div>
      <div className={s.when}>
        {site.lat.toFixed(2)}°N {site.lon.toFixed(2)}°E · {site.nameEn}
      </div>
      <p className={`${s.comment} ja`}>
        {query.data
          ? '気象庁の噴火警報・予報の一覧に、この火山の発表は載っていません。'
          : '◐ 発表状況を確認中…'}
      </p>
      <a className={s.ext} href={jmaVolcanoUrl(site.code)} target="_blank" rel="noreferrer">
        気象庁 火山の活動状況 ↗
      </a>
    </>
  )
}

const ROLE_NOTE: Record<string, string> = {
  eonet: 'NASA EONET: 他機関の報告を追跡する集約カタログ(観測そのものではない)',
  gdacs: 'GDACS: 人的影響の評価(観測ではない)',
  'relay-firms': 'AERIS が NASA FIRMS の衛星検出をクラスタ化した派生イベント',
  'relay-nhc': 'NOAA NHC の解析位置(中継経由)',
  swpc: 'NOAA SWPC の警報・注意報',
}

/** Events from aggregators / assessments / derived clusters. */
function GenericDetail({ e }: { e: NaturalEvent }) {
  const { events } = useNaturalEvents()
  const links = useGdacsLinks(events)
  const { select } = useSelection()
  const gdacs = links.get(e.id) ?? []
  const detail = e.detail as { description?: string; url?: string; nativeType?: string }
  const src = e.sources[0]?.source ?? ''
  return (
    <>
      <dl className={s.grid}>
        {detail.nativeType && (
          <>
            <dt>TYPE</dt>
            <dd>{detail.nativeType}</dd>
          </>
        )}
        {e.geometry.type === 'Point' && e.category !== 'space-weather' && (
          <>
            <dt>POSITION</dt>
            <dd>
              {e.geometry.coordinates[1].toFixed(2)}°, {e.geometry.coordinates[0].toFixed(2)}°
            </dd>
          </>
        )}
        {e.measures.map((m) => (
          <Fragment key={m.kind}>
            <dt>{m.kind.split('.')[1]?.toUpperCase()}</dt>
            <dd>
              {m.value} {m.unit}
              <QualityTags provenance={m.provenance} />
            </dd>
          </Fragment>
        ))}
        <dt>SOURCE ROLE</dt>
        <dd>
          <QualityTags provenance={e.provenance} />
        </dd>
      </dl>
      {ROLE_NOTE[src] && <p className={`${s.comment} ja`}>{ROLE_NOTE[src]}</p>}
      {detail.description && <p className={s.comment}>{detail.description}</p>}
      {gdacs.length > 0 && (
        <div className={s.derived}>
          <span className={s.derivedTag}>GDACS ASSESSMENT</span>
          {gdacs.map((a) => (
            <span key={a.id}>
              <b>{a.level.label}</b> {a.values.severity ?? ''}
            </span>
          ))}
        </div>
      )}
      {e.related?.map((r) => (
        <button key={r.id} type="button" className={s.clear} onClick={() => select(r.id)}>
          → RELATED {r.id.split(':')[0]?.toUpperCase()}
        </button>
      ))}
      {detail.url && (
        <a className={s.ext} href={detail.url} target="_blank" rel="noreferrer">
          SOURCE ↗
        </a>
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
      {e.category === 'tsunami' && <TsunamiDetail e={e} />}
      {e.category === 'tropical-cyclone' && <CycloneDetail e={e} />}
      {e.category === 'volcano' && <VolcanoDetail e={e} />}
      {!['earthquake', 'tsunami', 'tropical-cyclone', 'volcano'].includes(e.category) && (
        <GenericDetail e={e} />
      )}
    </>
  )
}

export const EventDetail = memo(function EventDetail() {
  const { selectedId, select } = useSelection()
  const { events } = useNaturalEvents()
  const systems = useEarthSystems()
  // Nothing picked: show the event behind the most severe domain headline.
  const autoId = systems.find((r) => r.reading.eventId)?.reading.eventId
  const { sites } = useVolcanoes()
  const picked = events.find((e) => e.id === selectedId)
  const site = selectedId?.startsWith('volcano-site:')
    ? sites.find((v) => `volcano-site:${v.code}` === selectedId)
    : undefined
  const shown = picked ?? events.find((e) => e.id === autoId)

  return (
    <Panel
      code="E-03"
      title="EVENT DETAIL"
      bodyClassName={s.body}
      meta={
        picked || site ? (
          <button type="button" className={s.clear} onClick={() => select(null)}>
            ✕ CLEAR
          </button>
        ) : undefined
      }
    >
      {site ? (
        <VolcanoSiteDetail site={site} />
      ) : shown ? (
        <Body e={shown} auto={!picked} />
      ) : (
        <div className={s.dim}>○ NO EVENT SELECTED</div>
      )}
    </Panel>
  )
})
