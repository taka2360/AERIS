/**
 * N-01 — Environment at the monitoring location. Each section chains values
 * of different kinds and says which kind each is:
 *   HYDRO  rain (AMeDAS OBS) → キキクル (JMA ASSESSMENT) → river (GloFAS MODEL) →
 *          river risk (洪水キキクル, JMA ASSESSMENT; stands in for gauges, which are not relayed)
 */
import { memo, useMemo } from 'react'
import { formatShortDate } from '@/domain/time'
import { useMinuteClock } from '@/query/clock'
import { AIR_LEVEL_LABEL, airIndex, REFERENCES } from '@/domain/earth/air'
import {
  dischargeSummary,
  useAir,
  useKikikuru,
  useLocalSample,
  useMarine,
  useRiver,
  useSnow,
} from '@/query/earth-hooks'
import type { AirKey } from '@/domain/earth/reports'
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
  const flood = useLocalSample('kikikuru-flood', kiki.data?.flood, 2)
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
      <div className={s.chainGrid}>
        <div className={s.node}>
          <span className={s.nodeHead}>
            <i>1</i>RAIN 1H
          </span>
          <span className={s.value}>
            {fmt(rain?.value ?? null)}
            <small>mm</small>
          </span>
          <ProvTag provenance={rain?.provenance} />
        </div>
        <div className={s.node}>
          <span className={s.nodeHead}>
            <i>2</i>キキクル
          </span>
          <Kiki label="浸水" sample={inund} />
          <Kiki label="土砂" sample={land} />
          <span className={s.tag}>JMA ASSESSMENT</span>
        </div>
        <div className={s.node}>
          <span className={s.nodeHead}>
            <i>3</i>RIVER FLOW
          </span>
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
        <div className={s.node}>
          <span className={s.nodeHead}>
            <i>4</i>RIVER RISK
          </span>
          <Kiki label="洪水" sample={flood} />
          <span className={s.tag}>JMA ASSESSMENT</span>
          <span className={s.note}>洪水キキクル · 周辺 2km の河川 · 水位の観測値ではない</span>
        </div>
      </div>
    </div>
  )
}

const POLLUTANTS: Array<{ key: AirKey; label: string; ref?: keyof typeof REFERENCES }> = [
  { key: 'pm2_5', label: 'PM2.5', ref: 'pm2_5' },
  { key: 'pm10', label: 'PM10', ref: 'pm10' },
  { key: 'ozone', label: 'O₃', ref: 'ozone' },
  { key: 'nitrogen_dioxide', label: 'NO₂', ref: 'nitrogen_dioxide' },
  { key: 'sulphur_dioxide', label: 'SO₂' },
  { key: 'carbon_monoxide', label: 'CO' },
  { key: 'dust', label: 'DUST' },
  { key: 'aerosol_optical_depth', label: 'AOD' },
  { key: 'uv_index', label: 'UV' },
]

/** Ratio to a reference value; above 1 is highlighted. */
function Ratio({ label, title, value }: { label: string; title: string; value: number }) {
  return (
    <span
      className={s.ratio}
      title={`${title} の ${value.toFixed(1)} 倍`}
      data-over={value >= 1 || undefined}
    >
      {label} <b>×{value.toFixed(1)}</b>
    </span>
  )
}

function AirSection() {
  const air = useAir()
  const a = air.data?.data
  const index = a ? airIndex(a.current) : null
  return (
    <section className={`${s.section} ${s.air}`} aria-label="大気環境">
      <h3 className={s.sectionHead}>
        AIR QUALITY
        {index ? (
          <span className={s.level} data-level={index.level}>
            {AIR_LEVEL_LABEL[index.level]}
          </span>
        ) : air.isError ? (
          <DataStateBadge state="unavailable" />
        ) : (
          <span className={s.dim}>--</span>
        )}
        {a && <QualityTags provenance={a.series.provenance} />}
      </h3>
      {a && (
        <>
          <div className={s.grid}>
            {POLLUTANTS.map((p) => {
              const v = a.current[p.key]
              const ref = p.ref ? REFERENCES[p.ref] : null
              return (
                <div key={p.key} className={s.cell}>
                  <span className={s.cellHead}>{p.label}</span>
                  <span className={s.value}>
                    {v == null ? '--' : v >= 100 ? Math.round(v) : v.toFixed(1)}
                    <small>{a.units[p.key] ?? ''}</small>
                  </span>
                  {ref && v != null && (
                    <span className={s.ratios}>
                      <Ratio label="WHO" title={ref.whoLabel} value={v / ref.who} />
                      <Ratio label="JP" title={ref.jpLabel} value={v / ref.jp} />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <span className={s.note}>
            ×は基準値に対する倍率(WHO 指針値 / JP 環境基準)。AERIS 指標({index?.rule})は CAMS
            モデルの1時間値を日平均等の基準と比べた目安 · 花粉: 日本域のデータなし
          </span>
        </>
      )}
    </section>
  )
}

const compass = (deg: number | null | undefined) =>
  deg == null ? '' : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]

function OceanSection() {
  const marine = useMarine()
  const m = marine.data?.data
  const c = m?.current
  const num = (v: number | null | undefined, digits: number) =>
    v == null ? null : v.toFixed(digits)
  // [label, value, unit, direction]
  const cells: Array<[string, string | null, string, string | undefined]> = c
    ? [
        ['WAVE', num(c.wave_height, 1), 'm', compass(c.wave_direction)],
        ['PERIOD', num(c.wave_period, 1), 's', ''],
        ['SWELL', num(c.swell_wave_height, 1), 'm', compass(c.swell_wave_direction)],
        ['SST', num(c.sea_surface_temperature, 1), '°C', ''],
        ['CURRENT', num(c.ocean_current_velocity, 1), 'km/h', compass(c.ocean_current_direction)],
        ['SEA LEVEL', num(c.sea_level_height_msl, 2), 'm', ''],
      ]
    : []
  return (
    <section className={`${s.section} ${s.ocean}`} aria-label="海洋">
      <h3 className={s.sectionHead}>
        OCEAN
        {m && <QualityTags provenance={m.series.provenance} />}
        {marine.isError && <DataStateBadge state="unavailable" />}
      </h3>
      {m && (
        <>
          <div className={s.grid}>
            {cells.map(([k, v, unit, dir]) => (
              <div key={k} className={s.cell}>
                <span className={s.cellHead}>{k}</span>
                <span className={s.value}>
                  {v ?? '--'}
                  {v != null && <small>{unit}</small>}
                  {v != null && dir && <small className={s.dir}>{dir}</small>}
                </span>
              </div>
            ))}
          </div>
          <span className={s.note}>
            最寄りの海域セル(監視地点から{m.cellDistanceKm}km)のモデル値 · 沿岸では精度が限られる ·
            海面高度は潮汐を含むモデル値で、検潮所の観測ではない
          </span>
        </>
      )}
    </section>
  )
}

function SnowSection() {
  const snow = useSnow()
  const depth = useLocalSample('snow-depth', snow.data?.depth, 1)
  const fall = useLocalSample('snowfall-3h', snow.data?.snowfall, 1)
  const text = (x: typeof depth, unit: string) =>
    x.isError || x.data?.decode === 'not-decoded'
      ? null
      : x.data
        ? x.data.value
          ? `${x.data.value.label} ${unit}`
          : 'なし'
        : '--'
  return (
    <section className={`${s.section} ${s.snow}`} aria-label="雪氷">
      <h3 className={s.sectionHead}>
        SNOW
        {snow.data && <QualityTags provenance={snow.data.depth.provenance} />}
      </h3>
      <div className={s.grid}>
        <div className={s.cell}>
          <span className={s.cellHead}>積雪の深さ</span>
          <span className={s.value}>
            {text(depth, 'cm') ?? <DataStateBadge state="unavailable" />}
          </span>
        </div>
        <div className={s.cell}>
          <span className={s.cellHead}>3時間降雪量</span>
          <span className={s.value}>
            {text(fall, 'cm') ?? <DataStateBadge state="unavailable" />}
          </span>
        </div>
      </div>
      <span className={s.note}>気象庁 解析積雪深・解析降雪量(観測とモデルからの推定)</span>
    </section>
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
      <div className={s.layout}>
        <section className={`${s.section} ${s.hydro}`} aria-label="水文">
          <h3 className={s.sectionHead}>HYDRO · RAIN → RISK → RIVER</h3>
          <HydroChain />
        </section>
        <AirSection />
        <OceanSection />
        <SnowSection />
      </div>
    </Panel>
  )
})
