/**
 * Hooks for the outlook panels: the extended daily series (2-week trend),
 * climate normals, and nowcast rain at the monitoring location for the next
 * hour. Values are returned as the sources state them; reading them (WBGT,
 * tide turns, anomaly classes) is done with domain functions by the panels.
 */
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { weekAnchor } from '@/domain/climate'
import type { RasterFieldSeries, RasterFrame } from '@/domain/earth/fields'
import { framesToIntervals } from '@/domain/earth/temporal'
import { unwrap } from '@/domain/result'
import { addMinutes, jstDateKey } from '@/domain/time'
import { roundPoint } from '@/services/provider'
import { useMinuteClock } from './clock'
import { earthKeys } from './earth-hooks'
import { useNowcastFrames, useResolvedLocation } from './hooks'
import { useLocationControl } from './location'
import { useWeatherProvider } from './provider-context'

const MIN = 60_000

export const outlookKeys = {
  extendedDaily: (lat: number, lon: number) => ['extended-daily', lat, lon] as const,
  normals: (lat: number, lon: number, anchor: string) => ['normals', lat, lon, anchor] as const,
}

function useRoundedPoint() {
  const { target } = useLocationControl()
  return useMemo(() => roundPoint(target), [target])
}

/** Daily model values a month back to 16 days ahead; refreshed hourly. */
export function useExtendedDaily() {
  const provider = useWeatherProvider()
  const { lat, lon } = useRoundedPoint()
  return useQuery({
    queryKey: outlookKeys.extendedDaily(lat, lon),
    queryFn: async ({ signal }) => unwrap(await provider.extendedDaily({ lat, lon }, signal)),
    staleTime: 60 * MIN,
    refetchInterval: 60 * MIN,
    meta: { persist: true },
  })
}

/** 1991–2020 normals around this week. Fetched once a week per location. */
export function useClimateNormals() {
  const provider = useWeatherProvider()
  const { lat, lon } = useRoundedPoint()
  const anchor = weekAnchor(jstDateKey(useMinuteClock()))
  return useQuery({
    queryKey: outlookKeys.normals(lat, lon, anchor),
    queryFn: async ({ signal }) =>
      unwrap(await provider.climateNormals({ lat, lon }, anchor, signal)),
    staleTime: Infinity,
    gcTime: 8 * 24 * 60 * MIN,
    retry: 2,
    meta: { persist: true },
  })
}

export type RainStep = {
  frame: RasterFrame
  /** Intensity class (0 = under 1 mm/h … 7 = 80+), -1 = no echo, null = unknown */
  level: number | null
  /** Class range as JMA states it, e.g. '10–20' (mm/h) */
  label: string | null
  pending: boolean
}

/**
 * JMA nowcast rain at the monitoring location: the newest observed frame and
 * every nowcast frame up to an hour after it, sampled from the tiles.
 */
export function useRainAhead() {
  const provider = useWeatherProvider()
  const nowcast = useNowcastFrames()
  const { location } = useResolvedLocation()
  const lat = Math.round(location.lat * 100) / 100
  const lon = Math.round(location.lon * 100) / 100

  const frames = useMemo(() => {
    const all = framesToIntervals(
      (nowcast.data?.data ?? []).map((f) => ({
        ...f,
        role: f.kind === 'observation' ? ('observed' as const) : ('nowcast' as const),
      })),
    )
    const latest = all.filter((f) => f.role === 'observed').at(-1)
    if (!latest) return []
    const until = addMinutes(latest.validTime, 60)
    return all.filter((f) => f === latest || (f.role === 'nowcast' && f.validTime <= until))
  }, [nowcast.data])

  const series = useMemo<RasterFieldSeries | null>(
    () =>
      nowcast.data
        ? {
            kind: 'precip-intensity',
            frames,
            derivation: 'measured',
            provenance: nowcast.data.provenance,
          }
        : null,
    [nowcast.data, frames],
  )

  const samples = useQueries({
    queries: frames.map((f) => ({
      queryKey: earthKeys.sample('precip-intensity', f.validFrom, lat, lon, 0),
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        unwrap(
          await provider.earth.atmosphere.sample(
            'precip-intensity',
            f,
            series!,
            { lat, lon },
            0,
            signal,
          ),
        ).data,
      enabled: !!series,
      staleTime: Infinity,
      gcTime: 15 * MIN,
    })),
  })

  const steps: RainStep[] = frames.map((frame, i) => {
    const q = samples[i]
    const s = q?.data
    const decoded = s && s.decode !== 'not-decoded'
    return {
      frame,
      level: !s ? null : s.value ? s.value.cls : decoded ? -1 : null,
      label: s?.value?.label ?? null,
      pending: !q || q.isPending,
    }
  })

  return {
    steps,
    basetime: frames[0]?.validTime ?? null,
    isPending: nowcast.isPending,
    isError: nowcast.isError || samples.some((q) => q.isError),
  }
}
