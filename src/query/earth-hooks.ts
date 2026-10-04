/**
 * Earth-observation query hooks. Polling follows each source's registry
 * policy (nominal / active) using signals derived from current data.
 */
import { useMemo } from 'react'
import { useQuery, type Query } from '@tanstack/react-query'
import type { SourceObservation } from '@/domain/earth/common'
import { intensityRank } from '@/domain/earth/derive'
import type { EarthquakeEvent, NaturalEvent } from '@/domain/earth/events'
import type { QuakeSolution } from '@/domain/earth/reports'
import { unwrap } from '@/domain/result'
import { minutesBetween, type Instant } from '@/domain/time'
import { seismicStatus, type SystemReading } from '@/domain/earth/status'
import type { Provenance, SourceId } from '@/domain/model'
import { fuseQuakes } from '@/services/fusion/earthquake'
import { pollInterval, type EarthSignals } from '@/services/poll-policy'
import { sourceSpec } from '@/sources/registry'
import { useMinuteClock } from './clock'
import { useWeatherProvider } from './provider-context'

type QuakeObs = SourceObservation<QuakeSolution>

export const earthKeys = {
  jmaQuakes: () => ['earth', 'jma-quake'] as const,
  usgsQuakes: () => ['earth', 'usgs-quake'] as const,
  quakeDetail: (id: string) => ['earth', 'jma-quake-detail', id] as const,
}

/** Signals from seismic data: the latest felt quake and its intensity. */
export function seismicSignals(jma: QuakeObs[] | undefined): EarthSignals {
  const strongest = (jma ?? [])
    .map((o) => ({ rank: intensityRank(o.data.maxIntensity), at: o.data.originTime }))
    .filter((x) => x.rank >= 0)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
  return strongest ? { latestQuake: { intensityRank: strongest.rank, at: strongest.at } } : {}
}

/** refetchInterval honouring the registry's adaptive policy. */
function adaptive<T>(
  source: SourceId,
  signals: (data: T | undefined) => EarthSignals,
  now: () => Instant,
) {
  const spec = sourceSpec(source)!
  return (q: Query<T, Error, T, readonly unknown[]>) =>
    pollInterval(spec, signals(q.state.data), now())
}

type Unwrapped<T> = { data: T; provenance: Provenance }

export function useJmaQuakes() {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: earthKeys.jmaQuakes(),
    queryFn: async ({ signal }) => unwrap(await provider.earth.seismic.jma(signal)),
    staleTime: 30_000,
    refetchInterval: adaptive<Unwrapped<QuakeObs[]>>(
      'jma-quake',
      (d) => seismicSignals(d?.data),
      provider.now,
    ),
    meta: { persist: true },
  })
}

export function useUsgsQuakes() {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: earthKeys.usgsQuakes(),
    queryFn: async ({ signal }) => unwrap(await provider.earth.seismic.usgs(signal)),
    staleTime: 60_000,
    refetchInterval: adaptive<Unwrapped<QuakeObs[]>>('usgs-quake', () => ({}), provider.now),
    meta: { persist: true },
  })
}

/** Canonical earthquakes from every seismic source, plus the association trail. */
export function useQuakeEvents() {
  const jma = useJmaQuakes()
  const usgs = useUsgsQuakes()
  const fusion = useMemo(
    () => fuseQuakes(jma.data?.data ?? [], usgs.data?.data ?? []),
    [jma.data, usgs.data],
  )
  return { ...fusion, jma, usgs, isPending: jma.isPending && usgs.isPending }
}

/** Per-station intensities for a selected JMA-sourced quake (fetched on demand). */
export function useQuakeDetail(event: EarthquakeEvent | null) {
  const provider = useWeatherProvider()
  const { jma } = useQuakeEvents()
  const ref = event?.sources.find((s) => s.source === 'jma-quake')
  const obs = ref ? jma.data?.data.find((o) => o.nativeId === ref.nativeId) : undefined
  return useQuery({
    queryKey: earthKeys.quakeDetail(ref?.nativeId ?? 'none'),
    queryFn: async ({ signal }) =>
      unwrap(await provider.earth.seismic.jmaDetail(obs!, signal)).data,
    enabled: !!obs,
    staleTime: 10 * 60_000,
  })
}

/** Every canonical natural event known to the terminal, newest first. */
export function useNaturalEvents(): { events: NaturalEvent[]; now: Instant } {
  const { events: quakes } = useQuakeEvents()
  const now = useMinuteClock()
  const events = useMemo<NaturalEvent[]>(
    () =>
      [...quakes].sort(
        (a, b) => Date.parse(b.time.startedAt ?? '') - Date.parse(a.time.startedAt ?? ''),
      ),
    [quakes],
  )
  return { events, now }
}

// ─── Event monitor ─────────────────────────────────────────────────────────

export type FeedState = 'ok' | 'partial' | 'stale' | 'unavailable' | 'pending'

export type SystemRow = {
  id: string
  label: string
  reading: SystemReading
  /** When we last confirmed the feed (not the event time) */
  checkedAt?: Instant
  feed: FeedState
  sources: string[]
}

type Q = {
  data?: { provenance: Provenance }
  isError: boolean
  failureCount: number
  isPending: boolean
}

/** Combine the state of a domain's feeds: all failing → unavailable, some → partial. */
export function feedState(queries: Q[], staleAfterMin: number, now: Instant): FeedState {
  const failing = queries.filter((q) => q.isError || q.failureCount > 0)
  const withData = queries.filter((q) => q.data)
  if (withData.length === 0) return failing.length === queries.length ? 'unavailable' : 'pending'
  const newest = withData
    .map((q) => q.data!.provenance.retrievedAt)
    .sort()
    .at(-1)!
  if (minutesBetween(newest, now) > staleAfterMin) return 'stale'
  return failing.length > 0 ? 'partial' : 'ok'
}

export function useEarthSystems(): SystemRow[] {
  const quakes = useQuakeEvents()
  const now = useMinuteClock()
  return useMemo(() => {
    const qs = [quakes.jma, quakes.usgs]
    const feed = feedState(qs, sourceSpec('jma-quake')!.freshness.staleAfterMin, now)
    const hasData = qs.some((q) => q.data)
    return [
      {
        id: 'seismic',
        label: 'SEISMIC',
        reading: seismicStatus(quakes.events, now, hasData),
        checkedAt: qs
          .map((q) => q.data?.provenance.retrievedAt)
          .filter((t): t is string => !!t)
          .sort()
          .at(-1),
        feed,
        sources: ['JMA', 'USGS'],
      },
    ]
  }, [quakes.events, quakes.jma, quakes.usgs, now])
}
