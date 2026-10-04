/**
 * Location state. Two channels, kept apart on purpose:
 *  - GPS: held in memory only, never persisted.
 *  - MANUAL: persisted to localStorage only when the user opts in.
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

export type TargetPoint = {
  lat: number
  lon: number
  origin: WeatherLocation['origin']
  label?: string
}

export type GpsStatus =
  'idle' | 'locating' | 'ok' | 'denied' | 'unavailable' | 'timeout' | 'unsupported'

type LocationContextValue = {
  target: TargetPoint
  gps: GpsStatus
  locate: () => void
  setManual: (p: { lat: number; lon: number; label?: string }, remember: boolean) => void
  forgetManual: () => void
}

export const DEFAULT_TARGET: TargetPoint = {
  lat: 35.6812,
  lon: 139.7671,
  origin: 'default',
  label: '東京',
}
const MANUAL_KEY = 'aeris.manualLocation'

function loadManual(): TargetPoint | null {
  try {
    const raw = window.localStorage.getItem(MANUAL_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<TargetPoint>
    if (typeof v.lat !== 'number' || typeof v.lon !== 'number') return null
    return { lat: v.lat, lon: v.lon, label: v.label, origin: 'manual' }
  } catch {
    return null
  }
}

function saveManual(p: TargetPoint | null) {
  try {
    if (p)
      window.localStorage.setItem(
        MANUAL_KEY,
        JSON.stringify({ lat: p.lat, lon: p.lon, label: p.label }),
      )
    else window.localStorage.removeItem(MANUAL_KEY)
  } catch {
    /* storage unavailable */
  }
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
  const [target, setTarget] = useState<TargetPoint>(() => initial ?? loadManual() ?? DEFAULT_TARGET)
  const [gps, setGps] = useState<GpsStatus>('idle')

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGps('unsupported')
      return
    }
    setGps('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps('ok')
        setTarget({ lat: pos.coords.latitude, lon: pos.coords.longitude, origin: 'gps' })
      },
      (err) => {
        setGps(
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable',
        )
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }, [])

  // Only auto-locate when permission was already granted — never prompt on load.
  useEffect(() => {
    if (!autoLocate || initial || loadManual()) return
    let cancelled = false
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((s) => {
        if (!cancelled && s.state === 'granted') locate()
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [autoLocate, initial, locate])

  const setManual = useCallback(
    (p: { lat: number; lon: number; label?: string }, remember: boolean) => {
      const t: TargetPoint = { ...p, origin: 'manual' }
      setTarget(t)
      saveManual(remember ? t : null)
    },
    [],
  )

  const forgetManual = useCallback(() => saveManual(null), [])

  const value = useMemo(
    () => ({ target, gps, locate, setManual, forgetManual }),
    [target, gps, locate, setManual, forgetManual],
  )
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export function useLocationControl(): LocationContextValue {
  const v = useContext(LocationContext)
  if (!v) throw new Error('LocationScope is missing')
  return v
}
