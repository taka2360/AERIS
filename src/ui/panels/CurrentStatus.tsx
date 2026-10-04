import { memo } from 'react'
import { CONDITION_LABEL, compass16 } from '@/domain/derive'
import { formatTime } from '@/domain/time'
import { useCurrentConditions, usePressureTendency } from '@/query/hooks'
import { fmt, signed } from '../format'
import { Panel } from '../primitives/Panel'
import { DataRow, Flash, ProvTag, SegmentBar } from '../primitives/primitives'
import s from './CurrentStatus.module.css'

function WindDial({ direction, speed }: { direction?: number; speed?: number }) {
  return (
    <svg className={s.dial} viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r="17" className={s.dialRing} />
      {Array.from({ length: 16 }, (_, i) => (
        <line
          key={i}
          x1="0"
          y1={i % 4 === 0 ? -17 : -17}
          x2="0"
          y2={i % 4 === 0 ? -13 : -15.5}
          transform={`rotate(${i * 22.5})`}
          className={s.dialTick}
        />
      ))}
      <text y="-7.5" className={s.dialN}>
        N
      </text>
      {direction != null && (
        // Arrow points where the wind blows TO (direction + 180°).
        <g transform={`rotate(${direction + 180})`}>
          <line x1="0" y1="11" x2="0" y2="-11" className={s.dialNeedle} />
          <path d="M0 -14 L3.2 -8 L-3.2 -8 Z" className={s.dialHead} />
        </g>
      )}
      <circle r="1.6" className={s.dialHub} />
      <title>{speed != null ? `${speed} m/s` : ''}</title>
    </svg>
  )
}

export const CurrentStatus = memo(function CurrentStatus() {
  const { current: c, primary } = useCurrentConditions()
  const tendency = usePressureTendency()
  const cond = c.condition ? CONDITION_LABEL[c.condition.value] : CONDITION_LABEL.unknown
  const trendGlyph = tendency ? { rising: '▲', falling: '▼', steady: '▶' }[tendency.trend] : ''

  return (
    <Panel
      code="A-01"
      title="CURRENT ATMOSPHERIC STATUS"
      meta={
        primary ? (
          <span>REF {formatTime(primary.observedAt, false)} JST</span>
        ) : (
          <span>MODEL ONLY</span>
        )
      }
      bodyClassName={s.body}
    >
      <div className={s.hero}>
        <div className={s.heroTemp}>
          <span className={s.heroLabel}>TEMP</span>
          <Flash value={c.temperature?.value} className={s.heroValue}>
            {fmt(c.temperature?.value)}
          </Flash>
          <span className={s.heroUnit}>°C</span>
          <ProvTag provenance={c.temperature?.provenance} />
        </div>
        <div className={s.heroSide}>
          <div className={s.cond}>
            <span className={s.condCode}>{cond.code}</span>
            <span className="ja">{cond.ja}</span>
          </div>
          <div className={s.subline}>
            <span>FEELS</span> <b>{fmt(c.apparentTemperature?.value)}</b>°C
          </div>
          <div className={s.subline}>
            <span>DEW</span> <b>{fmt(c.dewPoint?.value)}</b>°C
          </div>
          <div className={s.station}>
            {primary ? (
              <>
                STN <span className="ja">{primary.name}</span> · {primary.distanceKm.toFixed(1)}km ·
                #{primary.id}
              </>
            ) : (
              'NO STATION IN RANGE'
            )}
          </div>
        </div>
        <WindDial direction={c.windDirection?.value} speed={c.windSpeed?.value} />
      </div>

      <dl className={s.rows}>
        <DataRow
          label="HUMIDITY"
          value={fmt(c.humidity?.value, 0)}
          unit="%"
          provenance={c.humidity?.provenance}
          extra={
            <SegmentBar
              value={(c.humidity?.value ?? 0) / 100}
              segments={12}
              tone="cyan"
              label="湿度"
            />
          }
        />
        <DataRow
          label="PRESSURE"
          value={fmt(c.pressure?.value)}
          unit="hPa"
          provenance={c.pressure?.provenance}
          extra={
            tendency && (
              <span className={s.trend} data-trend={tendency.trend}>
                {trendGlyph} {signed(tendency.delta)}/{tendency.windowHours}h
              </span>
            )
          }
        />
        <DataRow
          label="WIND"
          value={fmt(c.windSpeed?.value)}
          unit="m/s"
          provenance={c.windSpeed?.provenance}
          extra={
            c.windDirection && (
              <span>
                {compass16(c.windDirection.value)} {String(c.windDirection.value).padStart(3, '0')}°
              </span>
            )
          }
          emphasis
        />
        <DataRow
          label="GUST"
          value={fmt(c.gust?.value)}
          unit="m/s"
          provenance={c.gust?.provenance}
        />
        <DataRow
          label="PRECIP"
          value={fmt(c.precipitation1h?.value)}
          unit="mm/h"
          provenance={c.precipitation1h?.provenance}
        />
        <DataRow
          label="CLOUD"
          value={fmt(c.cloudCover?.value, 0)}
          unit="%"
          provenance={c.cloudCover?.provenance}
          extra={
            <SegmentBar
              value={(c.cloudCover?.value ?? 0) / 100}
              segments={12}
              tone="amber"
              label="雲量"
            />
          }
        />
        <DataRow
          label="VISIBILITY"
          value={fmt(c.visibility?.value)}
          unit="km"
          provenance={c.visibility?.provenance}
        />
        <DataRow
          label="UV INDEX"
          value={fmt(c.uvIndex?.value)}
          provenance={c.uvIndex?.provenance}
        />
        <DataRow
          label="SUNSHINE"
          value={fmt(c.sunshine1h?.value, 0)}
          unit="min/h"
          provenance={c.sunshine1h?.provenance}
        />
      </dl>
    </Panel>
  )
})
