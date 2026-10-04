/**
 * N-01 — Environment at the monitoring location. Each section chains values
 * of different kinds and says which kind each is:
 *   HYDRO  rain (AMeDAS OBS) → キキクル (JMA ASSESSMENT) → river (GloFAS MODEL) → gauge
 */
import { memo, useMemo } from 'react'
import { formatShortDate } from '@/domain/time'
import { useMinuteClock } from '@/query/clock'
import { dischargeSummary, useKikikuru, useLocalSample, useRiver } from '@/query/earth-hooks'
import { useCurrentConditions } from '@/query/hooks'
import { fmt } from '../format'
import { Panel } from '../primitives/Panel'
import { DataStateBadge, ProvTag, QualityTags } from '../primitives/primitives'
import s from './Environment.module.css'

const KIKI_WORD: Record<number, string> = {
  1: '留意',
  2: '注意',
  3: '警戒',
  4: '危険',
  5: '災害切迫',
}

/** Past (analysis) solid, forecast dashed, a rule at today. */
export function Sparkline({ values, split }: { values: Array<number | null>; split: number }) {
  const nums = values.map((v) => v ?? 0)
  const max = Math.max(1, ...nums)
  const w = 120
  const h = 22
  const x = (i: number) => (i / Math.max(1, nums.length - 1)) * w
  const y = (v: number) => h - 2 - (v / max) * (h - 4)
  const path = (from: number, to: number) =>
    nums
      .slice(from, to)
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i + from).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ')
  return (
    <svg className={s.spark} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={path(0, split + 1)} className={s.sparkPast} />
      <path d={path(split, nums.length)} className={s.sparkFcst} />
      <line x1={x(split)} x2={x(split)} y1={0} y2={h} className={s.sparkNow} />
    </svg>
  )
}

function Kiki({ label, sample }: { label: string; sample: ReturnType<typeof useLocalSample> }) {
  const v = sample.data?.value?.value ?? null
  const failed = sample.isError || sample.data?.decode === 'not-decoded'
  return (
    <span className={s.kiki} data-level={v ?? 0}>
      <span className={s.kikiLabel}>{label}</span>
      {failed ? (
        <DataStateBadge state="unavailable" />
      ) : sample.data ? (
        <b>{v && v >= 2 ? KIKI_WORD[v] : 'なし'}</b>
      ) : (
        <span className={s.dim}>--</span>
      )}
      {sample.data?.decode === 'partial' && <DataStateBadge state="partial" />}
    </span>
  )
}

function HydroChain() {
  const { current } = useCurrentConditions()
  const kiki = useKikikuru()
  const land = useLocalSample('kikikuru-land', kiki.data?.land, 1)
  const inund = useLocalSample('kikikuru-inundation', kiki.data?.inundation, 1)
  const river = useRiver()
  const now = useMinuteClock()
  const pts = useMemo(() => river.data?.data.points ?? [], [river.data])
  const sum = useMemo(() => dischargeSummary(pts, now), [pts, now])
  const split = Math.max(
    0,
    pts.findIndex((p) => p.role === 'forecast'),
  )
  const rain = current.precipitation1h

  return (
    <div className={s.chain} role="group" aria-label="雨から河川への連鎖">
      <div className={s.node}>
        <span className={s.nodeHead}>RAIN 1H</span>
        <span className={s.value}>
          {fmt(rain?.value ?? null)}
          <small>mm</small>
        </span>
        <ProvTag provenance={rain?.provenance} />
      </div>
      <span className={s.arrow} aria-hidden="true">
        →
      </span>
      <div className={s.node}>
        <span className={s.nodeHead}>キキクル</span>
        <Kiki label="浸水" sample={inund} />
        <Kiki label="土砂" sample={land} />
        <span className={s.tag}>JMA ASSESSMENT</span>
      </div>
      <span className={s.arrow} aria-hidden="true">
        →
      </span>
      <div className={s.node}>
        <span className={s.nodeHead}>RIVER FLOW</span>
        {river.data ? (
          <>
            <span className={s.value}>
              {sum.today != null ? Math.round(sum.today) : '--'}
              <small>m³/s</small>
            </span>
            <Sparkline values={pts.map((p) => p.values.discharge ?? null)} split={split} />
            {sum.peakAt && (
              <span className={s.dim}>
                PEAK {sum.peak != null ? Math.round(sum.peak) : '--'} ·{' '}
                {formatShortDate(sum.peakAt)}
              </span>
            )}
            <QualityTags provenance={river.data.data.provenance} />
            <span className={s.note}>GloFAS 5km · 最寄り河川の推定</span>
          </>
        ) : river.isError ? (
          <DataStateBadge state="unavailable" />
        ) : (
          <span className={s.dim}>--</span>
        )}
      </div>
      <span className={s.arrow} aria-hidden="true">
        →
      </span>
      <div className={s.node}>
        <span className={s.nodeHead}>RIVER GAUGE</span>
        <DataStateBadge state="not-available" />
        <span className={s.note}>水位観測の中継は利用条件確認中</span>
      </div>
    </div>
  )
}

export const Environment = memo(function Environment() {
  return (
    <Panel
      code="N-01"
      title="ENVIRONMENT"
      bodyClassName={s.body}
      meta={<span>MONITORING LOCATION</span>}
    >
      <section className={s.section} aria-label="水文">
        <h3 className={s.sectionHead}>HYDRO · RAIN → RISK → RIVER</h3>
        <HydroChain />
      </section>
    </Panel>
  )
})
