/**
 * Boot overlay. Each line reflects a real request; it closes when the data
 * links settle or after BOOT_MAX_MS, whichever comes first. Any key or click
 * skips it, and it is shown once per browser session.
 */
import { useEffect, useState } from 'react'
import { formatCoord } from '@/domain/derive'
import {
  useAlerts,
  useForecast,
  useOfficialForecast,
  useResolvedLocation,
  useStations,
} from '@/query/hooks'
import s from './BootSequence.module.css'

const BOOT_MAX_MS = 1200
const SESSION_KEY = 'aeris.booted'

type StepState = 'wait' | 'ok' | 'fail'

function stateOf(q: {
  isSuccess: boolean
  isError: boolean
  failureCount: number
  data?: unknown
}): StepState {
  if (q.data !== undefined || q.isSuccess) return 'ok'
  if (q.isError || q.failureCount > 0) return 'fail'
  return 'wait'
}

function alreadyBooted(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function BootSequence() {
  const [visible, setVisible] = useState(() => !alreadyBooted())
  const [closing, setClosing] = useState(false)
  const { location, query: loc } = useResolvedLocation()
  const forecast = useForecast()
  const stations = useStations()
  const official = useOfficialForecast()
  const alerts = useAlerts()

  const steps: Array<{ label: string; state: StepState; info?: string }> = [
    { label: 'SYSTEM INITIALIZATION', state: 'ok' },
    {
      label: 'LOCATION LINK',
      state: stateOf(loc),
      info: formatCoord(location.lat, location.lon, 2),
    },
    { label: 'WEATHER DATA LINK', state: stateOf(forecast) },
    {
      label: 'OBS NETWORK (AMeDAS)',
      state: stateOf(stations),
      info: stations.data ? `${stations.data.data.length} STN` : undefined,
    },
    { label: 'FORECAST DATABASE', state: stateOf(official) },
    { label: 'WARNING SYSTEM', state: stateOf(alerts) },
  ]
  const settled = steps.every((st) => st.state !== 'wait')

  useEffect(() => {
    if (!visible) return
    const close = () => setClosing(true)
    const t = setTimeout(close, BOOT_MAX_MS)
    window.addEventListener('keydown', close, { once: true })
    window.addEventListener('pointerdown', close, { once: true })
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', close)
      window.removeEventListener('pointerdown', close)
    }
  }, [visible])

  useEffect(() => {
    if (settled && visible) {
      const t = setTimeout(() => setClosing(true), 220)
      return () => clearTimeout(t)
    }
  }, [settled, visible])

  useEffect(() => {
    if (!closing) return
    try {
      window.sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => setVisible(false), 260)
    return () => clearTimeout(t)
  }, [closing])

  if (!visible) return null
  return (
    <div className={s.overlay} data-closing={closing || undefined} aria-hidden="true">
      <div className={s.box}>
        <div className={s.title}>AERIS // ATMOSPHERIC MONITORING TERMINAL</div>
        <div className={s.ver}>BUILD 0.1.0 · JST</div>
        <ol className={s.steps}>
          {steps.map((st, i) => (
            <li key={st.label} style={{ animationDelay: `${i * 70}ms` }} data-state={st.state}>
              <span className={s.label}>{st.label}</span>
              <span className={s.dots} />
              <span className={s.state}>
                {st.state === 'ok' ? 'OK' : st.state === 'fail' ? 'FAIL' : '···'}
              </span>
              <span className={s.info}>{st.info}</span>
            </li>
          ))}
        </ol>
        <div className={s.online} data-ready={settled || undefined}>
          {settled
            ? steps.some((x) => x.state === 'fail')
              ? '▲ ONLINE — DEGRADED'
              : '● ONLINE'
            : '◐ LINKING'}
          <span className={s.cursor} />
        </div>
        <div className={s.hint}>PRESS ANY KEY TO SKIP</div>
      </div>
    </div>
  )
}
