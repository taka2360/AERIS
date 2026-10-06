/**
 * Line-drawn weather glyphs for the outlook. Pure SVG in a 32×32 box; parts
 * carry their own colour class (sun / cloud / rain / snow / bolt).
 */
import type { WeatherCondition } from '@/domain/model'
import s from './DailyForecast.module.css'

const CLOUD = 'M9 22h14a5 5 0 0 0 0-10 7 7 0 0 0-13.4 1.6A4.2 4.2 0 0 0 9 22z'
const CLOUD_SMALL = 'M13 24h11a4 4 0 0 0 0-8 5.6 5.6 0 0 0-10.7 1.3A3.4 3.4 0 0 0 13 24z'

function Sun({ cx = 16, cy = 16, r = 5 }: { cx?: number; cy?: number; r?: number }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    return (
      <line
        key={i}
        x1={cx + Math.cos(a) * (r + 2.5)}
        y1={cy + Math.sin(a) * (r + 2.5)}
        x2={cx + Math.cos(a) * (r + 5)}
        y2={cy + Math.sin(a) * (r + 5)}
      />
    )
  })
  return (
    <g className={s.icSun}>
      <circle cx={cx} cy={cy} r={r} />
      {rays}
    </g>
  )
}

function Drops({ n, x0 = 11 }: { n: number; x0?: number }) {
  return (
    <g className={s.icRain}>
      {Array.from({ length: n }, (_, i) => (
        <line key={i} x1={x0 + i * 5} y1={25} x2={x0 - 2 + i * 5} y2={30} />
      ))}
    </g>
  )
}

function Flakes({ n, x0 = 11 }: { n: number; x0?: number }) {
  return (
    <g className={s.icSnow}>
      {Array.from({ length: n }, (_, i) => (
        <text key={i} x={x0 + i * 5} y={31} textAnchor="middle">
          *
        </text>
      ))}
    </g>
  )
}

function Cloud({ small }: { small?: boolean }) {
  return <path className={s.icCloud} d={small ? CLOUD_SMALL : CLOUD} />
}

export function WxIcon({ condition }: { condition: WeatherCondition }) {
  let body
  switch (condition) {
    case 'clear':
      body = <Sun r={6} />
      break
    case 'mostly-clear':
      body = (
        <>
          <Sun cx={14} cy={13} r={5} />
          <path
            className={s.icCloud}
            d="M17 27h9a3.4 3.4 0 0 0 0-6.8 4.6 4.6 0 0 0-8.8 1A2.9 2.9 0 0 0 17 27z"
          />
        </>
      )
      break
    case 'partly-cloudy':
      body = (
        <>
          <Sun cx={11} cy={11} r={4} />
          <Cloud small />
        </>
      )
      break
    case 'overcast':
      body = <Cloud />
      break
    case 'fog':
      body = (
        <g className={s.icCloud}>
          <line x1={6} y1={12} x2={26} y2={12} />
          <line x1={4} y1={17} x2={24} y2={17} />
          <line x1={8} y1={22} x2={28} y2={22} />
        </g>
      )
      break
    case 'drizzle':
      body = (
        <>
          <Cloud />
          <Drops n={2} x0={13} />
        </>
      )
      break
    case 'rain':
    case 'showers':
      body = (
        <>
          {condition === 'showers' && <Sun cx={24} cy={8} r={3} />}
          <Cloud />
          <Drops n={3} />
        </>
      )
      break
    case 'heavy-rain':
      body = (
        <>
          <Cloud />
          <Drops n={4} x0={9} />
        </>
      )
      break
    case 'sleet':
      body = (
        <>
          <Cloud />
          <Drops n={1} x0={12} />
          <Flakes n={1} x0={20} />
        </>
      )
      break
    case 'snow':
    case 'heavy-snow':
      body = (
        <>
          <Cloud />
          <Flakes n={condition === 'snow' ? 2 : 3} x0={condition === 'snow' ? 13 : 11} />
        </>
      )
      break
    case 'thunder':
      body = (
        <>
          <Cloud />
          <path className={s.icBolt} d="M17 21l-4 6h4l-2 5 6-7h-4l2-4z" />
        </>
      )
      break
    default:
      body = (
        <text className={s.icUnknown} x={16} y={21} textAnchor="middle">
          ?
        </text>
      )
  }
  return (
    <svg className={s.icon} viewBox="0 0 32 32" aria-hidden="true">
      {body}
    </svg>
  )
}
