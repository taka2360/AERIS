/**
 * The terminal housing: one grid, panels separated by 1px rules.
 * Desktop shows everything at once; mobile switches between views.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLocationControl } from '@/query/location'
import { useSystemControls } from '@/query/hooks'
import { Timeline } from '../charts/Timeline'
import { SpatialScope } from '../map/SpatialScope'
import { AerisStatus } from '../panels/AerisStatus'
import { CurrentStatus } from '../panels/CurrentStatus'
import { DailyForecast } from '../panels/DailyForecast'
import { Environment } from '../panels/Environment'
import { EventDetail } from '../panels/EventDetail'
import { EventLog } from '../panels/EventLog'
import { EventMonitor } from '../panels/EventMonitor'
import { JmaWarning } from '../panels/JmaWarning'
import { OfficialForecast } from '../panels/OfficialForecast'
import { Solar } from '../panels/Solar'
import { AlertBand } from './AlertBand'
import { BootSequence } from './BootSequence'
import { SystemPanel } from './SystemPanel'
import { TimeCursorBand } from './TimeCursorBand'
import { TopBar } from './TopBar'
import s from './Terminal.module.css'

export type MobileView = 'status' | 'events' | 'timeline' | 'map' | 'forecast' | 'sys'

const VIEWS: Array<{ id: MobileView; label: string }> = [
  { id: 'status', label: 'STATUS' },
  { id: 'events', label: 'EVENTS' },
  { id: 'timeline', label: 'TIMELINE' },
  { id: 'map', label: 'SCOPE' },
  { id: 'forecast', label: 'OUTLOOK' },
  { id: 'sys', label: 'SYS' },
]

const MOBILE_QUERY = '(max-width: 767px)'

function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** True on the handheld layout, where only one view is visible at a time. */
function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function Terminal() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [view, setView] = useState<MobileView>('status')
  const isMobile = useIsMobile()
  const { locate } = useLocationControl()
  const { refresh } = useSystemControls()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      if (e.key === '/') {
        e.preventDefault()
        setSearchOpen(true)
      } else if (e.key === 'l' || e.key === 'L') locate()
      else if (e.key === 'r' || e.key === 'R') void refresh()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locate, refresh])

  return (
    <div className={s.root} data-view={view}>
      <a className="skip-link" href="#main">
        メインコンテンツへ移動
      </a>
      <BootSequence />
      <TopBar searchOpen={searchOpen} setSearchOpen={setSearchOpen} />
      <AlertBand />
      <TimeCursorBand />
      <main id="main" className={s.grid}>
        <div className={`${s.area} ${s.left}`} data-view-group="status">
          <CurrentStatus />
          <OfficialForecast />
        </div>
        <div className={`${s.area} ${s.center}`} data-view-group="map">
          {/* Hidden views stay mounted on mobile; keep the WebGL map off until shown. */}
          <SpatialScope active={!isMobile || view === 'map'} />
        </div>
        <div className={`${s.area} ${s.right}`} data-view-group="status">
          <JmaWarning />
          <EventMonitor />
          <AerisStatus />
          <Solar />
        </div>
        <div className={`${s.area} ${s.timeline}`} data-view-group="timeline">
          <Timeline />
        </div>
        <div className={`${s.area} ${s.env}`} data-view-group="status">
          <Environment />
        </div>
        <div className={`${s.area} ${s.log}`} data-view-group="events">
          <EventLog />
        </div>
        <div className={`${s.area} ${s.detail}`} data-view-group="events">
          <EventDetail />
        </div>
        <div className={`${s.area} ${s.daily}`} data-view-group="forecast">
          <DailyForecast />
        </div>
        <div className={`${s.area} ${s.sys}`} data-view-group="sys">
          <SystemPanel />
        </div>
      </main>
      <nav className={s.mobileNav} aria-label="表示切替">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={s.navBtn}
            aria-current={view === v.id ? 'page' : undefined}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
