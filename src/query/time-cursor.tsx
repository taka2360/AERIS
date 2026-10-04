/**
 * Global time cursor. Only the mode and the instant are global; each view
 * decides which span it can show and how its data resolves at t.
 *   live  — t follows the minute clock; views show their latest observations
 *   scrub — t is pinned by the user; views show what was valid at t (or NO DATA)
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Instant } from '@/domain/time'
import { useMinuteClock } from './clock'

export type TimeCursor = {
  mode: 'live' | 'scrub'
  t: Instant
  now: Instant
  scrubTo: (t: Instant) => void
  goLive: () => void
}

const Ctx = createContext<TimeCursor | null>(null)

export function TimeCursorScope({ children }: { children: ReactNode }) {
  const now = useMinuteClock()
  const [pinned, setPinned] = useState<Instant | null>(null)
  const scrubTo = useCallback((t: Instant) => setPinned(t), [])
  const goLive = useCallback(() => setPinned(null), [])
  const value = useMemo<TimeCursor>(
    () => ({ mode: pinned ? 'scrub' : 'live', t: pinned ?? now, now, scrubTo, goLive }),
    [pinned, now, scrubTo, goLive],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTimeCursor(): TimeCursor {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTimeCursor outside TimeCursorScope')
  return v
}
