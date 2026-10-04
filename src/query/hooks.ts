/**
 * Query hooks — the only way UI reaches data. They return domain types
 * plus request state; UI never sees source-specific shapes.
 */
import { useMemo, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { deriveAerisStatus, pressureTendency } from '@/domain/derive'
import { aggregateStatus, type SourceHealth } from '@/domain/health'
import type { SourceId, WeatherLocation } from '@/domain/model'
import { unwrap } from '@/domain/result'
import { mergeCurrent, primaryStation } from '@/services/current'
import { healthFromSnapshot } from '@/services/health'
import { roundPoint } from '@/services/provider'
import { clearPersistedCache } from './client'
import { useMinuteClock } from './clock'
import { useLocationControl } from './location'
import { useMapStatus, type MapStatus } from './map-status'
import { useWeatherProvider } from './provider-context'

const MIN = 60_000

export const queryKeys = {
  location: (lat: number, lon: number) => ['location', lat, lon] as const,
  forecast: (lat: number, lon: number) => ['forecast', lat, lon] as const,
  stations: (lat: number, lon: number) => ['stations', lat, lon] as const,
  windField: (lat: number, lon: number) => ['wind-field', lat, lon] as const,
  alerts: (class20: string) => ['alerts', class20] as const,
  official: (class10: string) => ['official-forecast', class10] as const,
  nowcast: () => ['nowcast-frames'] as const,
}

function useRoundedTarget() {
  const { target } = useLocationControl()
  return useMemo(
    () => ({ ...roundPoint(target), origin: target.origin, label: target.label }),
    [target],
  )
}

export function useResolvedLocation() {
  const provider = useWeatherProvider()
  const t = useRoundedTarget()
  const q = useQuery({
    queryKey: queryKeys.location(t.lat, t.lon),
    queryFn: async ({ signal }) => unwrap(await provider.resolveLocation(t, signal)).data,
    staleTime: Infinity,
  })
  // Until resolved, show a provisional location so coordinates are visible immediately.
  const location: WeatherLocation = q.data
    ? { ...q.data, origin: t.origin }
    : { lat: t.lat, lon: t.lon, name: t.label ?? '---', origin: t.origin }
  return { location, query: q }
}

export function useForecast() {
  const provider = useWeatherProvider()
  const { lat, lon } = useRoundedTarget()
  return useQuery({
    queryKey: queryKeys.forecast(lat, lon),
    queryFn: async ({ signal }) => unwrap(await provider.forecast({ lat, lon }, signal)),
    staleTime: 10 * MIN,
    refetchInterval: 10 * MIN,
    meta: { persist: true },
  })
}

export function useStations() {
  const provider = useWeatherProvider()
  const { lat, lon } = useRoundedTarget()
  return useQuery({
    queryKey: queryKeys.stations(lat, lon),
    queryFn: async ({ signal }) => unwrap(await provider.stations({ lat, lon }, signal)),
    staleTime: 5 * MIN,
    refetchInterval: 5 * MIN,
    meta: { persist: true },
  })
}

export function useWindField() {
  const provider = useWeatherProvider()
  const { lat, lon } = useRoundedTarget()
  return useQuery({
    queryKey: queryKeys.windField(lat, lon),
    queryFn: async ({ signal }) => unwrap(await provider.windField({ lat, lon }, signal)),
    staleTime: 30 * MIN,
    refetchInterval: 30 * MIN,
  })
}

export function useAlerts() {
  const provider = useWeatherProvider()
  const { location } = useResolvedLocation()
  const code = location.jma?.class20
  return useQuery({
    queryKey: queryKeys.alerts(code ?? 'none'),
    queryFn: async ({ signal }) => unwrap(await provider.alerts(location, signal)),
    enabled: !!code,
    staleTime: 3 * MIN,
    refetchInterval: 3 * MIN,
    meta: { persist: true },
  })
}

export function useOfficialForecast() {
  const provider = useWeatherProvider()
  const { location } = useResolvedLocation()
  const code = location.jma?.class10
  return useQuery({
    queryKey: queryKeys.official(code ?? 'none'),
    queryFn: async ({ signal }) => unwrap(await provider.officialForecast(location, signal)),
    enabled: !!code,
    staleTime: 30 * MIN,
    refetchInterval: 30 * MIN,
    meta: { persist: true },
  })
}

export function useNowcastFrames() {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: queryKeys.nowcast(),
    queryFn: async ({ signal }) => unwrap(await provider.nowcastFrames(signal)),
    staleTime: 5 * MIN,
    refetchInterval: 5 * MIN,
  })
}

export function usePlaceSearch(text: string) {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: ['place-search', text],
    queryFn: async ({ signal }) => unwrap(await provider.searchPlaces(text, signal)).data,
    enabled: text.length >= 1,
    staleTime: 60 * MIN,
  })
}

/** Current conditions: AMeDAS observation first, model fallback per field. */
export function useCurrentConditions() {
  const forecast = useForecast()
  const stations = useStations()
  const now = useMinuteClock()
  const current = useMemo(
    () =>
      mergeCurrent({
        model: forecast.data?.data.current,
        stations: stations.data?.data,
        stationsRetrievedAt: stations.data?.provenance.retrievedAt,
        now,
      }),
    [forecast.data, stations.data, now],
  )
  const primary = useMemo(() => primaryStation(stations.data?.data, now), [stations.data, now])
  return { current, primary, isLoading: forecast.isPending && stations.isPending }
}

export function useAerisStatus() {
  const { current } = useCurrentConditions()
  const forecast = useForecast()
  const now = useMinuteClock()
  return useMemo(
    () => ({
      ...deriveAerisStatus({ current, hourly: forecast.data?.data.hourly.points ?? [], now }),
      /** False when the forecast model is missing — inbound/trend rules cannot be evaluated */
      inputComplete: forecast.data !== undefined,
    }),
    [current, forecast.data, now],
  )
}

export function usePressureTendency() {
  const forecast = useForecast()
  const now = useMinuteClock()
  return useMemo(
    () => (forecast.data ? pressureTendency(forecast.data.data.hourly.points, now) : null),
    [forecast.data, now],
  )
}

// ─── Health ────────────────────────────────────────────────────────────────

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useBrowserOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

/** Data-time based freshness limits per channel (minutes). */
const MAX_AGE_MIN: Partial<Record<SourceId, number>> = {
  openmeteo: 180,
  'jma-amedas': 40,
  'jma-warning': 30,
  'jma-forecast': 24 * 60,
  'jma-nowcast': 20,
}

export type Channel = { id: string; label: string; health: SourceHealth }

function snapshot<T>(q: UseQueryResult<T>, dataTime?: string) {
  return {
    hasData: q.data !== undefined,
    dataUpdatedAt: q.dataUpdatedAt,
    errorUpdatedAt: q.errorUpdatedAt,
    error: q.error ?? q.failureReason,
    isFetching: q.isFetching,
    failureCount: q.failureCount,
    dataTime,
  }
}

/** The basemap is a UI subsystem, not a query; translate its self-reported state. */
function basemapHealth(m: MapStatus): SourceHealth {
  const base = { source: 'basemap' as const, lastSuccessAt: m.lastOkAt, errorMessage: m.detail }
  switch (m.state) {
    case 'online':
      return {
        ...base,
        connectivity: 'online',
        freshness: 'fresh',
        validity: 'valid',
        fetching: false,
      }
    case 'loading':
      return {
        ...base,
        connectivity: 'unknown',
        freshness: 'none',
        validity: 'unknown',
        fetching: true,
      }
    case 'degraded':
    case 'unsupported':
      return {
        ...base,
        connectivity: 'online',
        freshness: 'fresh',
        validity: 'invalid',
        fetching: false,
      }
    case 'standby':
      return {
        ...base,
        connectivity: 'unknown',
        freshness: 'none',
        validity: 'unknown',
        fetching: false,
      }
  }
}

export const CRITICAL_SOURCES: SourceId[] = ['openmeteo', 'jma-amedas']

export function useSystemHealth() {
  const forecast = useForecast()
  const stations = useStations()
  const alerts = useAlerts()
  const official = useOfficialForecast()
  const nowcast = useNowcastFrames()
  const mapStatus = useMapStatus()
  const online = useBrowserOnline()
  const now = useMinuteClock()

  return useMemo(() => {
    const opts = (s: SourceId) => ({ now, maxAgeMin: MAX_AGE_MIN[s] ?? 60, browserOnline: online })
    const latestFrame = nowcast.data?.data.filter((f) => f.kind === 'observation').at(-1)?.validTime
    const channels: Channel[] = [
      {
        id: 'model',
        label: 'FORECAST MODEL',
        health: healthFromSnapshot('openmeteo', snapshot(forecast), opts('openmeteo')),
      },
      {
        id: 'amedas',
        label: 'AMeDAS OBS',
        health: healthFromSnapshot(
          'jma-amedas',
          snapshot(stations, stations.data?.data[0]?.observedAt),
          opts('jma-amedas'),
        ),
      },
      {
        id: 'warning',
        label: 'JMA WARNING',
        health: healthFromSnapshot('jma-warning', snapshot(alerts), opts('jma-warning')),
      },
      {
        id: 'official',
        label: 'JMA FORECAST',
        health: healthFromSnapshot(
          'jma-forecast',
          snapshot(official, official.data?.provenance.issuedAt),
          opts('jma-forecast'),
        ),
      },
      {
        id: 'nowcast',
        label: 'RADAR NOWCAST',
        health: healthFromSnapshot(
          'jma-nowcast',
          snapshot(nowcast, latestFrame),
          opts('jma-nowcast'),
        ),
      },
      { id: 'basemap', label: 'BASEMAP', health: basemapHealth(mapStatus) },
    ]
    const overall = aggregateStatus(
      channels.map((c) => c.health),
      CRITICAL_SOURCES,
    )
    const lastUpdate = channels
      .map((c) => c.health.lastSuccessAt)
      .filter((x): x is string => !!x)
      .sort()
      .at(-1)
    return { channels, overall, lastUpdate, online }
  }, [forecast, stations, alerts, official, nowcast, mapStatus, online, now])
}

// ─── System controls ───────────────────────────────────────────────────────

export function useDataMode(): 'mock' | 'live' {
  return useWeatherProvider().id
}

/** Refresh all data, or wipe every locally stored item (cache + remembered location). */
export function useSystemControls() {
  const client = useQueryClient()
  const { forgetManual } = useLocationControl()
  return useMemo(
    () => ({
      refresh: () => client.invalidateQueries(),
      clearLocalData: () => {
        clearPersistedCache(client)
        forgetManual()
      },
    }),
    [client, forgetManual],
  )
}
