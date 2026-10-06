/**
 * H-01 — Heat stress (暑さ指数 WBGT), estimated by AERIS from the forecast
 * model's temperature, humidity, solar radiation and wind with the formula
 * 環境省 uses for sites without a WBGT meter. It is not the Ministry's WBGT
 * forecast or a 熱中症警戒アラート, and says so.
 */
import { memo, useMemo } from 'react'
import { estimateWbgt, WBGT_LEVELS, WBGT_RULE, wbgtLevel } from '@/domain/heat'
import { epoch, formatHour, formatTime, jstDateKey } from '@/domain/time'
import { useMinuteClock } from '@/query/clock'
import { useForecast } from '@/query/hooks'
import { fmt } from '../format'
import { Panel } from '../primitives/Panel'
import { QualityTags } from '../primitives/primitives'
import s from './HeatStress.module.css'

const ENV_URL = 'https://www.wbgt.env.go.jp/'
/** Scale of the level bar, °C (WBGT) */
const SCALE: [number, number] = [15, 35]
const pos = (v: number) =>
  `${Math.max(0, Math.min(100, ((v - SCALE[0]) / (SCALE[1] - SCALE[0])) * 100))}%`

export const HeatStress = memo(function HeatStress() {
  const q = useForecast()
  const now = useMinuteClock()

  const hours = useMemo(() => {
    const pts = q.data?.data.hourly.points ?? []
    const t = epoch(now) - 3_600_000
    return pts
      .filter((p) => epoch(p.time) >= t)
      .slice(0, 25)
      .map((p) => ({
        time: p.time,
        wbgt: estimateWbgt(p.temperature, p.humidity, p.solarRadiation ?? null, p.windSpeed),
      }))
  }, [q.data, now])

  const current = hours.find((h) => epoch(h.time) >= epoch(now) - 30 * 60_000) ?? hours[0]
  const today = jstDateKey(now)
  const peak = hours
    .filter((h) => jstDateKey(h.time) === today && h.wbgt != null)
    .reduce<(typeof hours)[number] | null>((a, h) => (!a || h.wbgt! > a.wbgt! ? h : a), null)
  const level = current?.wbgt != null ? wbgtLevel(current.wbgt) : null

  return (
    <Panel
      code="H-01"
      title="HEAT STRESS · WBGT"
      bodyClassName={s.body}
      meta={<QualityTags provenance={{ role: 'forecast', derivation: 'estimated' }} />}
    >
      {!current || current.wbgt == null ? (
        <div className={s.pending}>
          {q.isError ? '■ NO FORECAST DATA' : '◐ ACQUIRING FORECAST…'}
        </div>
      ) : (
        <>
          <div className={s.now} data-level={level!.level}>
            <div className={s.value}>
              <b>{fmt(current.wbgt)}</b>
              <span>°C</span>
            </div>
            <div className={s.levelBox}>
              <span className={s.levelJa}>{level!.ja}</span>
              <span className={s.advice}>{level!.advice}</span>
            </div>
          </div>

          <div className={s.scale} aria-hidden="true">
            {WBGT_LEVELS.slice()
              .reverse()
              .map((l, i, arr) => {
                const lo = Math.max(SCALE[0], l.min)
                const hi = Math.min(SCALE[1], arr[i + 1]?.min ?? SCALE[1])
                return (
                  <i
                    key={l.level}
                    data-level={l.level}
                    style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }}
                  >
                    <span>{l.ja}</span>
                  </i>
                )
              })}
            <b className={s.marker} style={{ left: pos(current.wbgt) }} />
          </div>

          <div className={s.strip} role="img" aria-label="今後24時間の暑さ指数(推定)">
            {hours.slice(0, 25).map((h) => {
              const lv = h.wbgt != null ? wbgtLevel(h.wbgt) : null
              return (
                <div
                  key={h.time}
                  className={s.hour}
                  data-level={lv?.level}
                  title={`${formatTime(h.time, false)} ${fmt(h.wbgt)}`}
                >
                  <i style={{ height: h.wbgt == null ? 0 : pos(h.wbgt) }} />
                  {formatHour(h.time) === '00' || formatHour(h.time) === '12' ? (
                    <small>{formatHour(h.time)}</small>
                  ) : null}
                </div>
              )
            })}
          </div>

          <dl className={s.rows}>
            <dt>TODAY PEAK</dt>
            <dd>
              {peak ? (
                <>
                  <b data-level={wbgtLevel(peak.wbgt!).level}>{fmt(peak.wbgt)}</b> ·{' '}
                  {formatTime(peak.time, false)} 頃 ·{' '}
                  <span className="ja">{wbgtLevel(peak.wbgt!).ja}</span>
                </>
              ) : (
                '--'
              )}
            </dd>
          </dl>
          <p className={`${s.note} ja`}>
            AERIS 推定({WBGT_RULE.method} v{WBGT_RULE.version}):
            モデルの気温・湿度・日射・風から環境省の推定式で算出。環境省の暑さ指数予測・熱中症警戒アラートではありません。{' '}
            <a href={ENV_URL} target="_blank" rel="noreferrer">
              環境省 熱中症予防情報 ↗
            </a>
          </p>
        </>
      )}
    </Panel>
  )
})
