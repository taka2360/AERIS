/**
 * Compact summary of a selected event, shown on the map next to what was
 * clicked. The full record (each source's values, agency levels, AERIS rule)
 * stays in E-03; the popup links there.
 */
import { haversineKm } from '@/domain/derive'
import { quakeSeverity } from '@/domain/earth/derive'
import { formatDate, formatTime } from '@/domain/time'
import { useNaturalEvents, useVolcanoes } from '@/query/earth-hooks'
import { useResolvedLocation } from '@/query/hooks'
import {
  ageLabel,
  CATEGORY_JA,
  CATEGORY_TAG,
  eventFigure,
  eventTime,
  sourceTags,
} from './event-format'
import s from './EventPopup.module.css'

const SEVERITY_JA = {
  none: '影響なし',
  minor: '軽微',
  moderate: '中程度',
  severe: '大きい',
  extreme: '甚大',
} as const

export const EVENT_DETAIL_ID = 'event-detail'

function openDetail() {
  document.getElementById(EVENT_DETAIL_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

export function EventPopup({
  id,
  at,
  onClose,
}: {
  id: string
  at: [number, number]
  onClose: () => void
}) {
  const { events, now } = useNaturalEvents()
  const { sites } = useVolcanoes()
  const { location } = useResolvedLocation()
  const e = events.find((x) => x.id === id)
  const site = id.startsWith('volcano-site:')
    ? sites.find((v) => `volcano-site:${v.code}` === id)
    : undefined
  const km = Math.round(haversineKm(location.lat, location.lon, at[1], at[0]))

  const head = (tag: string, title: string) => (
    <div className={s.head}>
      <span className={s.tag}>{tag}</span>
      <span className={`${s.title} ja`}>{title}</span>
      <button type="button" className={s.close} onClick={onClose} aria-label="閉じる">
        ✕
      </button>
    </div>
  )

  if (site)
    return (
      <>
        {head('VOLC', site.name)}
        <div className={s.body}>
          <div className={s.figure}>
            <span className="ja">発表中の噴火警報・予報なし</span>
          </div>
          <dl className={s.rows}>
            <dt>DIST</dt>
            <dd>{km.toLocaleString()} km</dd>
            <dt>SRC</dt>
            <dd>JMA 活火山</dd>
          </dl>
        </div>
        <Footer />
      </>
    )
  if (!e)
    return (
      <>
        {head('--', '---')}
        <div className={s.body}>
          <span className={s.dim}>○ EVENT NO LONGER LISTED</span>
        </div>
      </>
    )

  const t = eventTime(e)
  const sev = e.category === 'earthquake' ? quakeSeverity(e).value : null
  const depth = e.category === 'earthquake' ? e.detail.hypocenter.depthKm : undefined
  return (
    <>
      {head(CATEGORY_TAG[e.category], e.title)}
      <div className={s.body}>
        <div className={s.figure}>
          <b>{eventFigure(e) || '--'}</b>
          <span className={`${s.cat} ja`}>{CATEGORY_JA[e.category]}</span>
        </div>
        <dl className={s.rows}>
          <dt>TIME</dt>
          <dd>
            {t ? `${formatDate(t)} ${formatTime(t, false)} JST` : '--'}
            <span className={s.age}>{ageLabel(now, t)}</span>
          </dd>
          {depth !== undefined && (
            <>
              <dt>DEPTH</dt>
              <dd>{depth == null ? '不明' : depth === 0 ? 'ごく浅い' : `${depth} km`}</dd>
            </>
          )}
          <dt>DIST</dt>
          <dd>{km.toLocaleString()} km · 監視地点から</dd>
          <dt>SRC</dt>
          <dd>{sourceTags(e).join(' + ')}</dd>
          {sev && (
            <>
              <dt>AERIS</dt>
              <dd className={s.sev} data-sev={sev}>
                影響度 {SEVERITY_JA[sev]}
              </dd>
            </>
          )}
        </dl>
        {e.lifecycle === 'cancelled' && <div className={s.cancel}>■ 取消</div>}
      </div>
      <Footer />
    </>
  )
}

function Footer() {
  return (
    <button type="button" className={s.more} onClick={openDetail}>
      <span>DETAIL</span>
      <span className={s.moreCode}>E-03 ▸</span>
    </button>
  )
}
