/**
 * Wind arrows for whatever the map shows: lattice points covering the view
 * (see domain/wind-lattice), fetched only when not already cached. Each point
 * costs one model API call, so points are cached per provider for an hour and
 * shared across zoom levels (coarser lattices are subsets of finer ones).
 * Cached arrows are drawn at once while missing ones load.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WindSample } from '@/domain/model'
import { latticeKey, viewLattice, type ViewBounds } from '@/domain/wind-lattice'
import type { WeatherProvider } from '@/services/provider'
import { useWeatherProvider } from './provider-context'

const TTL_MS = 60 * 60_000
/**
 * Short wait before asking for missing points. Shorter than the map's view
 * reports while moving (150 ms), so points are requested during a long pan or
 * zoom rather than only once it stops.
 */
const DELAY_MS = 100
/** Points per request (URL length and per-request cost) */
const CHUNK = 100
/** Most points drawn for one view; wider views get a coarser lattice (API budget) */
const MAX_POINTS = 300

type Entry = { sample: WindSample; at: number }
const caches = new WeakMap<WeatherProvider, Map<string, Entry>>()

function cacheOf(p: WeatherProvider): Map<string, Entry> {
  let c = caches.get(p)
  if (!c) caches.set(p, (c = new Map()))
  return c
}

export function useViewportWind(view: ViewBounds | null, enabled: boolean): WindSample[] {
  const provider = useWeatherProvider()
  const cache = cacheOf(provider)
  const [version, setVersion] = useState(0)
  const points = useMemo(
    () => (view && enabled ? viewLattice(view, MAX_POINTS) : []),
    [view, enabled],
  )

  // In-flight requests are not cancelled when the view moves on: their
  // points are still useful once cached. Only unmounting aborts them.
  const inflight = useRef(new Set<string>())
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => {
    ctrl.current = new AbortController()
    return () => ctrl.current?.abort()
  }, [provider])

  useEffect(() => {
    if (points.length === 0) return
    const timer = setTimeout(() => {
      const signal = ctrl.current?.signal
      if (!signal || signal.aborted) return
      const now = Date.now()
      const want = new Map<string, (typeof points)[number]>()
      for (const p of points) {
        const e = cache.get(p.key)
        if ((!e || now - e.at > TTL_MS) && !inflight.current.has(p.key)) want.set(p.key, p)
      }
      const missing = [...want.values()]
      for (let i = 0; i < missing.length; i += CHUNK) {
        const chunk = missing.slice(i, i + CHUNK)
        for (const p of chunk) inflight.current.add(p.key)
        void provider
          .windAt(
            chunk.map((p) => ({ lat: p.lat, lon: p.fetchLon })),
            signal,
          )
          .catch(() => null)
          .then((r) => {
            for (const p of chunk) inflight.current.delete(p.key)
            if (!r?.ok || signal.aborted) return
            const at = Date.now()
            for (const s of r.data) cache.set(latticeKey(s.lat, s.lon), { sample: s, at })
            setVersion((v) => v + 1)
          })
      }
    }, DELAY_MS)
    return () => clearTimeout(timer)
  }, [points, provider, cache])

  return useMemo(() => {
    void version // re-read the cache after each fetch
    const out: WindSample[] = []
    for (const p of points) {
      const e = cache.get(p.key)
      // Drawn at the point's own longitude (the view may be past ±180°).
      if (e)
        out.push({ lat: p.lat, lon: p.lon, speed: e.sample.speed, direction: e.sample.direction })
    }
    return out
  }, [points, cache, version])
}
