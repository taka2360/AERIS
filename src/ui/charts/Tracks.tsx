/**
 * Timeline tracks. Each track is memoised and depends only on data — the
 * moving cursor lives in an HTML overlay and never re-renders these SVGs.
 */
import { memo, useId, type ReactNode } from 'react'
import type { HourlyPoint } from '@/domain/model'
import { areaPath, linePath, niceDomain, VB_H, VB_W, xAt, yScale } from './geometry'
import s from './Timeline.module.css'

export type TrackTick = { value: number; label: string }

export type TrackLayout = {
  id: string
  label: string
  unit: string
  height: number
  ticks: TrackTick[]
  domain: [number, number]
}

/** SVG frame: grid + past/future split via clip paths. */
function Frame({
  n,
  nowIndex,
  ticks,
  domain,
  children,
}: {
  n: number
  nowIndex: number
  ticks: TrackTick[]
  domain: [number, number]
  children: ReactNode
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const xNow = Math.max(0, Math.min(VB_W, xAt(nowIndex, n)))
  const y = yScale(domain)
  return (
    <svg
      className={s.plotSvg}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`p${uid}`}>
          <rect x="0" y="-10" width={xNow} height={VB_H + 20} />
        </clipPath>
        <clipPath id={`f${uid}`}>
          <rect x={xNow} y="-10" width={VB_W - xNow} height={VB_H + 20} />
        </clipPath>
      </defs>
      <g className={s.grid}>
        {ticks.map((t) => (
          <line key={t.value} x1="0" x2={VB_W} y1={y(t.value)} y2={y(t.value)} />
        ))}
        {Array.from({ length: n }, (_, i) =>
          i % 3 === 0 ? (
            <line key={i} className={s.gridV} x1={xAt(i, n)} x2={xAt(i, n)} y1="0" y2={VB_H} />
          ) : null,
        )}
      </g>
      <g className={s.past} clipPath={`url(#p${uid})`}>
        {children}
      </g>
      <g className={s.future} clipPath={`url(#f${uid})`}>
        {children}
      </g>
    </svg>
  )
}

function ticksFor(domain: [number, number], step: number, digits = 0, suffix = ''): TrackTick[] {
  const [lo, hi] = domain
  const out: TrackTick[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    out.push({ value: v, label: `${v.toFixed(digits)}${suffix}` })
  }
  return out
}

const pick = (pts: HourlyPoint[], k: keyof HourlyPoint) => pts.map((p) => p[k] as number | null)

/** Vertical plot margins per track (viewBox units); the default leaves 6 at both ends. */
const Y_RANGE: Record<string, [number, number]> = {
  precip: [4, VB_H],
  hum: [3, VB_H - 3],
  wind: [4, VB_H - 2],
}

/** A track's value → viewBox y. Shared with the cursor probe so its marks sit on the series. */
export function trackY(layout: TrackLayout) {
  const [top, bottom] = Y_RANGE[layout.id] ?? [6, VB_H - 6]
  return yScale(layout.domain, top, bottom)
}

// ─── Layout computation (shared by labels column and plots) ───────────────

export function computeLayouts(points: HourlyPoint[]): Record<string, TrackLayout> {
  const temps = [
    ...pick(points, 'temperature'),
    ...pick(points, 'apparentTemperature'),
    ...pick(points, 'dewPoint'),
  ]
  const tempDomain = niceDomain(temps, 8, 0.08)
  const precipMax = Math.max(4, ...pick(points, 'precipitation').map((v) => v ?? 0)) * 1.15
  const presDomain = niceDomain(pick(points, 'pressure'), 6, 0.15)
  const windMax = Math.max(8, ...pick(points, 'gust').map((v) => v ?? 0)) * 1.1
  const tempSpan = tempDomain[1] - tempDomain[0]
  return {
    temp: {
      id: 'temp',
      label: 'TEMP',
      unit: '°C',
      height: 104,
      domain: tempDomain,
      ticks: ticksFor(tempDomain, tempSpan > 16 ? 5 : 2),
    },
    precip: {
      id: 'precip',
      label: 'PRECIP',
      unit: 'mm/h',
      height: 64,
      domain: [0, precipMax],
      ticks: ticksFor([0, precipMax], precipMax > 20 ? 10 : precipMax > 8 ? 4 : 2),
    },
    hum: {
      id: 'hum',
      label: 'HUMID',
      unit: '%',
      height: 44,
      domain: [0, 100],
      ticks: ticksFor([0, 100], 50),
    },
    pres: {
      id: 'pres',
      label: 'PRESS',
      unit: 'hPa',
      height: 52,
      domain: presDomain,
      ticks: ticksFor(presDomain, presDomain[1] - presDomain[0] > 12 ? 5 : 2),
    },
    wind: {
      id: 'wind',
      label: 'WIND',
      unit: 'm/s',
      height: 64,
      domain: [0, windMax],
      ticks: ticksFor([0, windMax], windMax > 20 ? 10 : 5),
    },
  }
}

type TrackProps = { points: HourlyPoint[]; nowIndex: number; layout: TrackLayout }

export const TempTrack = memo(function TempTrack({ points, nowIndex, layout }: TrackProps) {
  const y = trackY(layout)
  const t = pick(points, 'temperature')
  return (
    <Frame n={points.length} nowIndex={nowIndex} ticks={layout.ticks} domain={layout.domain}>
      <path className={s.areaFill} d={areaPath(t, y, VB_H)} />
      <path className={s.seriesDew} d={linePath(pick(points, 'dewPoint'), y)} />
      <path className={s.seriesFaint} d={linePath(pick(points, 'apparentTemperature'), y)} />
      <path className={s.seriesMain} d={linePath(t, y)} />
    </Frame>
  )
})

export const PrecipTrack = memo(function PrecipTrack({ points, nowIndex, layout }: TrackProps) {
  const y = trackY(layout)
  const yPop = yScale([0, 100], 4, VB_H)
  const n = points.length
  const bw = (VB_W / (n - 1)) * 0.62
  return (
    <Frame n={n} nowIndex={nowIndex} ticks={layout.ticks} domain={layout.domain}>
      {points.map((p, i) => {
        const v = p.precipitation ?? 0
        if (v <= 0) return null
        const top = y(v)
        const intensity = v >= 30 ? 'extreme' : v >= 10 ? 'heavy' : 'normal'
        return (
          <rect
            key={p.time}
            className={s.bar}
            data-intensity={intensity}
            x={xAt(i, n) - bw / 2}
            y={top}
            width={bw}
            height={VB_H - top}
          />
        )
      })}
      <path
        className={s.seriesPop}
        d={linePath(
          points.map((p) => p.precipitationProbability),
          yPop,
          false,
        )}
      />
    </Frame>
  )
})

export const HumidityTrack = memo(function HumidityTrack({ points, nowIndex, layout }: TrackProps) {
  const y = trackY(layout)
  const h = pick(points, 'humidity')
  return (
    <Frame n={points.length} nowIndex={nowIndex} ticks={layout.ticks} domain={layout.domain}>
      <path className={s.areaFillSoft} d={areaPath(h, y, VB_H)} />
      <path className={s.seriesMain} d={linePath(h, y)} />
    </Frame>
  )
})

export const PressureTrack = memo(function PressureTrack({ points, nowIndex, layout }: TrackProps) {
  const y = trackY(layout)
  return (
    <Frame n={points.length} nowIndex={nowIndex} ticks={layout.ticks} domain={layout.domain}>
      <path className={s.seriesMain} d={linePath(pick(points, 'pressure'), y)} />
    </Frame>
  )
})

export const WindTrack = memo(function WindTrack({ points, nowIndex, layout }: TrackProps) {
  const y = trackY(layout)
  return (
    <Frame n={points.length} nowIndex={nowIndex} ticks={layout.ticks} domain={layout.domain}>
      <path className={s.seriesGust} d={linePath(pick(points, 'gust'), y)} />
      <path className={s.areaFillSoft} d={areaPath(pick(points, 'windSpeed'), y, VB_H)} />
      <path className={s.seriesMain} d={linePath(pick(points, 'windSpeed'), y)} />
    </Frame>
  )
})
