import { memo, useEffect, useRef } from 'react'
import { formatCoord } from '@/domain/derive'
import { formatDate, formatTime, formatWeekday } from '@/domain/time'
import { useSecondClock } from '@/query/clock'
import { useResolvedLocation, useSystemHealth } from '@/query/hooks'
import { useLocationControl, type GpsStatus } from '@/query/location'
import { KeyButton, StatusLamp } from '../primitives/primitives'
import { LocationSearch } from './LocationSearch'
import s from './TopBar.module.css'

const Clock = memo(function Clock() {
  const now = useSecondClock()
  return (
    <div className={s.clock}>
      <time className={s.clockTime} dateTime={now}>
        {formatTime(now)}
      </time>
      <span className={s.clockMeta}>
        JST · {formatDate(now)} {formatWeekday(now)}
      </span>
    </div>
  )
})

const GPS_TEXT: Record<GpsStatus, string> = {
  idle: '',
  stored: 'LAST FIX (STORED)',
  locating: 'ACQUIRING GPS…',
  ok: '',
  denied: 'GPS DENIED',
  unavailable: 'GPS UNAVAILABLE',
  timeout: 'GPS TIMEOUT',
  unsupported: 'GPS UNSUPPORTED',
}

export const TopBar = memo(function TopBar({
  searchOpen,
  setSearchOpen,
}: {
  searchOpen: boolean
  setSearchOpen: (v: boolean) => void
}) {
  const { location, query } = useResolvedLocation()
  const { gps, locate } = useLocationControl()
  const { overall } = useSystemHealth()
  const searchWrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!searchOpen) return
    const onDown = (e: PointerEvent) => {
      if (!searchWrap.current?.contains(e.target as Node)) setSearchOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [searchOpen, setSearchOpen])

  const gpsMsg = GPS_TEXT[gps]
  const gpsError =
    gps === 'denied' || gps === 'unavailable' || gps === 'timeout' || gps === 'unsupported'

  return (
    <header className={s.bar}>
      <div className={s.brand}>
        <svg className={s.mark} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 1v5M12 18v5M1 12h5M18 12h5" />
        </svg>
        <div>
          <div className={s.name}>AERIS</div>
          <div className={s.sub}>ATMOSPHERIC MONITORING TERMINAL</div>
        </div>
      </div>

      <div className={s.loc} aria-live="polite">
        <div className={s.locLabel}>
          LOC
          <span className={s.origin} data-origin={location.origin}>
            {location.origin === 'gps'
              ? 'GPS'
              : location.origin === 'manual'
                ? 'MANUAL'
                : 'DEFAULT'}
          </span>
          {location.jma && <span className={s.code}>JMA {location.jma.class20}</span>}
        </div>
        <div className={s.locName}>
          <span className="ja">{query.isPending ? '解決中…' : location.name}</span>
          {location.subName && <span className={`${s.locSub} ja`}>{location.subName}</span>}
        </div>
        <div className={s.coord}>
          {formatCoord(location.lat, location.lon, 2)}
          {gpsMsg && (
            <span
              className={s.gpsMsg}
              data-error={gpsError || undefined}
              role={gpsError ? 'alert' : undefined}
            >
              {gpsError ? '■ ' : '◐ '}
              {gpsMsg}
            </span>
          )}
        </div>
      </div>

      <Clock />

      <div className={s.right}>
        <div className={s.link}>
          <span className={s.linkLabel}>DATA LINK</span>
          <StatusLamp status={overall} />
        </div>
        <div className={s.actions} ref={searchWrap}>
          <KeyButton
            onClick={locate}
            disabled={gps === 'locating'}
            hotkey="L"
            aria-label="現在地を取得"
          >
            LOCATE
          </KeyButton>
          <KeyButton
            onClick={() => setSearchOpen(!searchOpen)}
            hotkey="/"
            aria-expanded={searchOpen}
            aria-label="地点を検索"
          >
            SEARCH
          </KeyButton>
          {searchOpen && <LocationSearch onClose={() => setSearchOpen(false)} />}
        </div>
      </div>
    </header>
  )
})
