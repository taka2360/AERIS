/**
 * C-01 — How the weather compares with the 1991–2020 normal: today's max/min,
 * the past 30 days and the next one and two weeks, plus a stripe per day of
 * the mean-temperature difference. The normal is AERIS's own reduction of
 * ERA5 reanalysis (not JMA's 平年値), and the class names follow AERIS's rule.
 */
import { memo, useMemo } from 'react'
import { ANOMALY_LABEL, ANOMALY_RULE, classify, shiftDate, type NormalDay } from '@/domain/climate'
import type { DailyPoint } from '@/domain/model'
import { useClimateNormals, useExtendedDaily } from '@/query/outlook-hooks'
import { fmt, signed } from '../format'
import { Panel } from '../primitives/Panel'
import s from './ClimateAnomaly.module.css'

/** Stripe scale: ±5 °C fills the half-height */
const STRIPE_MAX = 5

type Joined = { day: DailyPoint; normal: NormalDay; mean: number | null; anomaly: number | null }

function join(days: DailyPoint[], normals: Map<string, NormalDay>): Joined[] {
  return days.flatMap((day) => {
    const normal = normals.get(day.date)
    if (!normal) return []
    const mean = day.tempMax != null && day.tempMin != null ? (day.tempMax + day.tempMin) / 2 : null
    return [
      { day, normal, mean, anomaly: mean == null ? null : mean - (normal.tmax + normal.tmin) / 2 },
    ]
  })
}

function avg(rows: Joined[]): number | null {
  const v = rows.flatMap((r) => (r.anomaly == null ? [] : [r.anomaly]))
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
}

function rainRatio(rows: Joined[]): number | null {
  const known = rows.filter((r) => r.day.precipitationSum != null)
  const normal = known.reduce((a, r) => a + r.normal.precip, 0)
  if (!known.length || normal <= 0) return null
  return Math.round((known.reduce((a, r) => a + r.day.precipitationSum!, 0) / normal) * 100)
}

const tone = (v: number | null) =>
  v == null ? undefined : v >= 0.5 ? 'warm' : v <= -0.5 ? 'cold' : 'even'

export const ClimateAnomaly = memo(function ClimateAnomaly() {
  const ext = useExtendedDaily()
  const normals = useClimateNormals()
  const today = ext.data?.data.today

  const rows = useMemo(
    () =>
      join(
        ext.data?.data.days ?? [],
        new Map((normals.data?.data.days ?? []).map((n) => [n.date, n])),
      ),
    [ext.data, normals.data],
  )

  if (!today || rows.length === 0)
    return (
      <Panel code="C-01" title="CLIMATE ANOMALY" bodyClassName={s.body}>
        <div className={s.pending}>
          {normals.isError || ext.isError
            ? '■ NORMALS UNAVAILABLE'
            : '◐ BUILDING 1991–2020 NORMALS…'}
        </div>
      </Panel>
    )

  const from30 = shiftDate(today, -30)
  const past = rows.filter((r) => r.day.date >= from30 && r.day.date < today)
  const next7 = rows.filter((r) => r.day.date >= today && r.day.date < shiftDate(today, 7))
  const next14 = rows.filter((r) => r.day.date >= today && r.day.date < shiftDate(today, 14))
  const stripes = rows.filter((r) => r.day.date >= from30 && r.day.date < shiftDate(today, 14))
  const t = rows.find((r) => r.day.date === today)
  const todayIdx = stripes.findIndex((r) => r.day.date === today)

  const cell = (
    label: string,
    nowV: number | null | undefined,
    normalV: number,
    pct?: NormalDay['tmaxPct'],
  ) => {
    const diff = nowV == null ? null : nowV - normalV
    const cls = nowV != null && pct ? classify(nowV, pct) : null
    return (
      <div className={s.today} data-cls={cls ?? undefined}>
        <span className={s.k}>{label}</span>
        <b>{diff == null ? '--' : signed(diff)}</b>
        <span className={s.sub}>
          {fmt(nowV)}° / 平年 {fmt(normalV)}°
        </span>
        {cls && <span className={`${s.cls} ja`}>{ANOMALY_LABEL[cls]}</span>}
      </div>
    )
  }

  const p30 = avg(past)
  const r30 = rainRatio(past)
  const a7 = avg(next7)
  const a14 = avg(next14)

  return (
    <Panel
      code="C-01"
      title="CLIMATE ANOMALY"
      bodyClassName={s.body}
      meta={<span className="ja">平年差 · 1991–2020</span>}
    >
      {t && (
        <div className={s.todayRow}>
          {cell('TODAY MAX', t.day.tempMax, t.normal.tmax, t.normal.tmaxPct)}
          {cell('TODAY MIN', t.day.tempMin, t.normal.tmin, t.normal.tminPct)}
        </div>
      )}

      <div
        className={s.stripes}
        role="img"
        aria-label={`日平均気温の平年差 過去30日 平均${fmt(p30)}度、今後14日 平均${fmt(a14)}度`}
      >
        {stripes.map((r, i) => {
          const a = r.anomaly
          const h = a == null ? 0 : (Math.min(STRIPE_MAX, Math.abs(a)) / STRIPE_MAX) * 50
          return (
            <span
              key={r.day.date}
              className={s.stripe}
              data-sign={a == null ? undefined : a >= 0 ? 'warm' : 'cold'}
              data-future={i >= todayIdx || undefined}
              title={`${r.day.date} ${a == null ? '--' : signed(a)}°C`}
            >
              <i style={{ height: `${h}%` }} />
            </span>
          )
        })}
        {todayIdx >= 0 && (
          <span className={s.todayMark} style={{ left: `${(todayIdx / stripes.length) * 100}%` }}>
            TODAY
          </span>
        )}
      </div>
      <div className={s.axis} aria-hidden="true">
        <span>−30D</span>
        <span>平均気温の平年差 ±{STRIPE_MAX}°C</span>
        <span>+14D</span>
      </div>

      <dl className={s.stats}>
        <div>
          <dt>過去30日 気温</dt>
          <dd data-tone={tone(p30)}>{p30 == null ? '--' : `${signed(p30)}°C`}</dd>
        </div>
        <div>
          <dt>過去30日 降水量</dt>
          <dd data-tone={r30 == null ? undefined : r30 >= 130 ? 'wet' : r30 <= 70 ? 'dry' : 'even'}>
            {r30 == null ? '--' : `平年比 ${r30}%`}
          </dd>
        </div>
        <div>
          <dt>今後7日 気温</dt>
          <dd data-tone={tone(a7)}>{a7 == null ? '--' : `${signed(a7)}°C`}</dd>
        </div>
        <div>
          <dt>今後14日 気温</dt>
          <dd data-tone={tone(a14)}>{a14 == null ? '--' : `${signed(a14)}°C`}</dd>
        </div>
      </dl>
      <p className={`${s.note} ja`}>
        平年値は ERA5 再解析 1991–2020 から AERIS が算出(±7日窓)、区分は AERIS 判定(
        {ANOMALY_RULE.method} v{ANOMALY_RULE.version})。気象庁の平年値ではありません。
        過去はモデル解析値、今後は予報値との差で、目安です。
      </p>
    </Panel>
  )
})
