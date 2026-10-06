/**
 * Wind arrows for whatever the map shows: lattice points covering the view
 * (see domain/wind-lattice), fetched only when not already cached. Each point
 * costs one model API call, so points are cached per provider for an hour and
 * shared across zoom levels (coarser lattices are subsets of finer ones).
 * Cached arrows are drawn at once while missing ones load; points that could
 * not be fetched (e.g. quota exhausted) are not asked for again until the
 * source's retry-after has passed. The cache is kept in localStorage too, so
 * a reload within the hour redraws the arrows without spending the quota.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WindSample } from '@/domain/model'
import { latticeKey, viewLattice, type ViewBounds } from '@/domain/wind-lattice'
import type { WeatherProvider } from '@/services/provider'
import { cacheStorageKey } from './client'
import { useWeatherProvider } from './provider-context'

const TTL_MS = 60 * 60_000
/**
 * Wait before asking for missing points. Longer than the map's view reports
 * while moving (150 ms), so points are requested only once the view settles:
 * the lattices passed through during a zoom or fly-to would each cost a
 * call per point (HTTP 429 from the provider's per-minute quota).
 */
const DELAY_MS = 400
/** Back-off for points whose request failed without a retry-after */
const FAIL_BACKOFF_MS = 60_000
/**
 * Points per request (URL length and per-request cost). Small enough that
 * what is left of the quota still fills the centre of the view.
 */
const CHUNK = 40
/** Most points drawn for one view; wider views get a coarser lattice (API budget) */
const MAX_POINTS = 200

/** Stored points at most (~40 bytes each); the newest are kept */
const MAX_STORED = 5_000
/** Writes are batched: one per burst of responses */
const SAVE_DELAY_MS = 1_000

type Entry = { sample: WindSample; at: number }
const caches = new WeakMap<WeatherProvider, Map<string, Entry>>()

/** Under the query cache's prefix, so "clear cache" removes it too. */
const windStorageKey = (p: WeatherProvider) => `${cacheStorageKey(p.id)}.wind`

function cacheOf(p: WeatherProvider): Map<string, Entry> {
  let c = caches.get(p)
  if (!c) caches.set(p, (c = loadWindCache(readStored(windStorageKey(p)), Date.now())))
  return c
}

/** Stored form: [lat, lon, speed, direction, fetchedAt] per point */
type StoredPoint = [number, number, number, number, number]

/** Unexpired points from stored JSON; anything malformed is ignored. */
export function loadWindCache(json: string | null, now: number): Map<string, Entry> {
  const out = new Map<string, Entry>()
  if (!json) return out
  let rows: unknown
  try {
    rows = JSON.parse(json)
  } catch {
    return out
  }
  if (!Array.isArray(rows)) return out
  for (const r of rows) {
    if (!Array.isArray(r) || r.length !== 5 || !r.every((v) => typeof v === 'number')) continue
    const [lat, lon, speed, direction, at] = r as StoredPoint
    if (!(now - at <= TTL_MS && at <= now)) continue
    out.set(latticeKey(lat, lon), { sample: { lat, lon, speed, direction }, at })
  }
  return out
}

/** Unexpired points as JSON, newest first, at most MAX_STORED. */
export function serializeWindCache(cache: Map<string, Entry>, now: number): string {
  const rows: StoredPoint[] = []
  for (const { sample: s, at } of cache.values())
    if (now - at <= TTL_MS) rows.push([s.lat, s.lon, s.speed, s.direction, at])
  rows.sort((a, b) => b[4] - a[4])
  return JSON.stringify(rows.slice(0, MAX_STORED))
}

// localStorage may be unavailable (private mode, blocked site data) or full.
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>()
function scheduleSave(p: WeatherProvider, cache: Map<string, Entry>): void {
  const key = windStorageKey(p)
  if (pendingSaves.has(key)) return
  pendingSaves.set(
    key,
    setTimeout(() => {
      pendingSaves.delete(key)
      try {
        window.localStorage.setItem(key, serializeWindCache(cache, Date.now()))
      } catch {
        /* storage unavailable or full: the in-memory cache still works */
      }
    }, SAVE_DELAY_MS),
  )
}

/** Forget fetched arrows in memory (the stored copy goes with the query cache). */
export function clearWindCache(p: WeatherProvider): void {
  const key = windStorageKey(p)
  clearTimeout(pendingSaves.get(key))
  pendingSaves.delete(key)
  caches.get(p)?.clear()
}

export function useViewportWind(view: ViewBounds | null, enabled: boolean): WindSample[] {
  const provider = useWeatherProvider()
  const cache = cacheOf(provider)
  const [version, setVersion] = useState(0)
  /** Bumped when backed-off points may be asked for again */
  const [retryTick, setRetryTick] = useState(0)
  const points = useMemo(
    () => (view && enabled ? viewLattice(view, MAX_POINTS) : []),
    [view, enabled],
  )

  // In-flight requests are not cancelled when the view moves on: their
  // points are still useful once cached. Only unmounting aborts them.
  const inflight = useRef(new Set<string>())
  /** Lattice key → earliest time to ask again after a failure */
  const retryAt = useRef(new Map<string, number>())
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
        if (
          (!e || now - e.at > TTL_MS) &&
          !inflight.current.has(p.key) &&
          (retryAt.current.get(p.key) ?? 0) <= now
        )
          want.set(p.key, p)
      }
      // Centre of the view first: if the quota runs out, the edges go without.
      const cLat = points.reduce((a, p) => a + p.lat, 0) / points.length
      const cLon = points.reduce((a, p) => a + p.lon, 0) / points.length
      const d = (p: (typeof points)[number]) => (p.lat - cLat) ** 2 + (p.lon - cLon) ** 2
      const missing = [...want.values()].sort((a, b) => d(a) - d(b))
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
            if (signal.aborted) return
            if (!r?.ok) {
              const until = Date.now() + (r?.error.retryAfterMs ?? FAIL_BACKOFF_MS)
              for (const p of chunk) retryAt.current.set(p.key, until)
              setTimeout(() => {
                if (!signal.aborted) setRetryTick((t) => t + 1)
              }, until - Date.now())
              return
            }
            const at = Date.now()
            for (const s of r.data) cache.set(latticeKey(s.lat, s.lon), { sample: s, at })
            scheduleSave(provider, cache)
            setVersion((v) => v + 1)
          })
      }
    }, DELAY_MS)
    return () => clearTimeout(timer)
  }, [points, provider, cache, retryTick])

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
