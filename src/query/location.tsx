/**
 * Location state. Two channels, each persisted to localStorage separately:
 *  - GPS: the last fix, rounded to 0.01° (~1 km), so a reload starts from it.
 *    Dropped when the browser reports the geolocation permission as denied.
 *  - MANUAL: only when the user opts in.
 * On load the newer of the two wins.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { WeatherLocation } from '@/domain/model'
import { roundPoint } from '@/services/provider'

export type TargetPoint = {
  lat: number
  lon: number
  origin: WeatherLocation['origin']
  label?: string
}

export type GpsStatus =
  'idle' | 'stored' | 'locating' | 'ok' | 'denied' | 'unavailable' | 'timeout' | 'unsupported'

type LocationContextValue = {
  target: TargetPoint
  gps: GpsStatus
  locate: () => void
  setManual: (p: { lat: number; lon: number; label?: string }, remember: boolean) => void
  /** Forget every stored location (manual and GPS). */
  forgetStored: () => void
}

export const DEFAULT_TARGET: TargetPoint = {
  lat: 35.6812,
  lon: 139.7671,
  origin: 'default',
  label: '東京',
}
const MANUAL_KEY = 'aeris.manualLocation'
const GPS_KEY = 'aeris.gpsLocation'

type Stored = { point: TargetPoint; at: number }

function load(key: string, origin: 'gps' | 'manual'): Stored | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const v = JSON.parse(raw) as { lat?: unknown; lon?: unknown; label?: unknown; at?: unknown }
    if (typeof v.lat !== 'number' || typeof v.lon !== 'number') return null
    if (Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180) return null
    return {
      point: {
        lat: v.lat,
        lon: v.lon,
        label: typeof v.label === 'string' ? v.label : undefined,
        origin,
      },
      // Entries written before timestamps existed count as oldest.
      at: typeof v.at === 'number' ? v.at : 0,
    }
  } catch {
    return null
  }
}

function save(key: string, p: TargetPoint | null) {
  try {
    if (p)
      window.localStorage.setItem(
        key,
        JSON.stringify({ lat: p.lat, lon: p.lon, label: p.label, at: Date.now() }),
      )
    else window.localStorage.removeItem(key)
  } catch {
    /* storage unavailable */
  }
}

/** The newer of the remembered manual point and the last GPS fix. */
function loadStored(): Stored | null {
  const manual = load(MANUAL_KEY, 'manual')
  const gps = load(GPS_KEY, 'gps')
  if (!manual || !gps) return manual ?? gps
  return gps.at > manual.at ? gps : manual
}

const LocationContext = createContext<LocationContextValue | null>(null)

export function LocationScope({
  children,
  initial,
  autoLocate = true,
}: {
  children: ReactNode
  initial?: TargetPoint
  autoLocate?: boolean
}) {
  const [stored] = useState(() => (initial ? null : loadStored()))
  const [target, setTarget] = useState<TargetPoint>(
    () => initial ?? stored?.point ?? DEFAULT_TARGET,
  )
  const [gps, setGps] = useState<GpsStatus>(stored?.point.origin === 'gps' ? 'stored' : 'idle')

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGps('unsupported')
      return
    }
    setGps('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const t: TargetPoint = {
          ...roundPoint({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          origin: 'gps',
        }
        setGps('ok')
        setTarget(t)
        save(GPS_KEY, t)
      },
      (err) => {
        setGps(
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable',
        )
        if (err.code === err.PERMISSION_DENIED) save(GPS_KEY, null)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }, [])

  // Only auto-locate when permission was already granted — never prompt on load.
  // A remembered manual point that is newer than the last fix stays put.
  useEffect(() => {
    if (!autoLocate || initial || stored?.point.origin === 'manual') return
    let cancelled = false
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((s) => {
        if (cancelled) return
        if (s.state === 'granted') locate()
        else if (s.state === 'denied' && stored) {
          // Permission revoked since the fix was stored: drop it.
          save(GPS_KEY, null)
          setTarget(load(MANUAL_KEY, 'manual')?.point ?? DEFAULT_TARGET)
          setGps('idle')
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [autoLocate, initial, stored, locate])

  const setManual = useCallback(
    (p: { lat: number; lon: number; label?: string }, remember: boolean) => {
      const t: TargetPoint = { ...p, origin: 'manual' }
      setTarget(t)
      setGps((g) => (g === 'stored' ? 'idle' : g))
      save(MANUAL_KEY, remember ? t : null)
    },
    [],
  )

  const forgetStored = useCallback(() => {
    save(MANUAL_KEY, null)
    save(GPS_KEY, null)
  }, [])

  const value = useMemo(
    () => ({ target, gps, locate, setManual, forgetStored }),
    [target, gps, locate, setManual, forgetStored],
  )
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export function useLocationControl(): LocationContextValue {
  const v = useContext(LocationContext)
  if (!v) throw new Error('LocationScope is missing')
  return v
}
