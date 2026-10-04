/**
 * Shared clocks. One interval per resolution, shared by all subscribers,
 * so a ticking seconds display does not re-render the whole terminal.
 */
import { useSyncExternalStore } from 'react'
import { epoch, toInstant, type Instant } from '@/domain/time'
import { useWeatherProvider } from './provider-context'

type Store = { subscribe: (cb: () => void) => () => void; get: () => number }

function createTicker(periodMs: number): Store {
  const listeners = new Set<() => void>()
  let value = Math.floor(Date.now() / periodMs)
  let id: ReturnType<typeof setInterval> | undefined
  const tick = () => {
    const next = Math.floor(Date.now() / periodMs)
    if (next !== value) {
      value = next
      listeners.forEach((l) => l())
    }
  }
  return {
    subscribe(cb) {
      listeners.add(cb)
      if (!id) id = setInterval(tick, Math.min(periodMs, 1000) / 2)
      return () => {
        listeners.delete(cb)
        if (listeners.size === 0 && id) {
          clearInterval(id)
          id = undefined
        }
      }
    },
    get: () => value,
  }
}

const seconds = createTicker(1_000)
const minutes = createTicker(60_000)

/** Wall clock at 1-second resolution (for clock displays only). */
export function useSecondClock(): Instant {
  const provider = useWeatherProvider()
  useSyncExternalStore(seconds.subscribe, seconds.get)
  return provider.now()
}

/** Clock at 1-minute resolution for interpreting data (freshness, now-markers). */
export function useMinuteClock(): Instant {
  const provider = useWeatherProvider()
  useSyncExternalStore(minutes.subscribe, minutes.get)
  // Truncate to the minute so the returned string is stable within a minute.
  const ms = epoch(provider.now())
  return toInstant(ms - (ms % 60_000))
}
