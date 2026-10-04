/**
 * Earth-observation query hooks. Polling follows each source's registry
 * policy (nominal / active) using signals derived from current data.
 */
import { useMemo } from 'react'
import { useQuery, type Query } from '@tanstack/react-query'
import type { SourceObservation } from '@/domain/earth/common'
import { intensityRank } from '@/domain/earth/derive'
import type { EarthquakeEvent, NaturalEvent } from '@/domain/earth/events'
import type { QuakeSolution, TsunamiReport } from '@/domain/earth/reports'
import { unwrap } from '@/domain/result'
import { minutesBetween, type Instant } from '@/domain/time'
import {
  cycloneStatus,
  lightningStatus,
  nearbyAreaCodes,
  summarizeStrokes,
  tornadoStatus,
  volcanoStatus,
  hydroStatus,
  groundStatus,
  seismicStatus,
  severeStatus,
  tsunamiStatus,
  type SystemReading,
} from '@/domain/earth/status'
import { tsunamiKindRank } from '@/sources/jma-tsunami'
import { useAlerts, useResolvedLocation } from './hooks'
import type { Provenance, SourceId } from '@/domain/model'
import { fuseQuakes } from '@/services/fusion/earthquake'
import { fuseTsunami } from '@/services/fusion/tsunami'
import { cycloneEvent } from '@/services/fusion/cyclone'
import { fuseVolcanoes } from '@/services/fusion/volcano'
import type { CycloneReport } from '@/sources/jma-typhoon'
import { pollInterval, type EarthSignals } from '@/services/poll-policy'
import { nominalPollMs, sourceSpec } from '@/sources/registry'
import type {
  PointSeries,
  RasterFieldKind,
  RasterFieldSeries,
  RasterFrame,
} from '@/domain/earth/fields'
import { useMinuteClock } from './clock'
import { useWeatherProvider } from './provider-context'

type QuakeObs = SourceObservation<QuakeSolution>

export const earthKeys = {
  jmaQuakes: () => ['earth', 'jma-quake'] as const,
  usgsQuakes: () => ['earth', 'usgs-quake'] as const,
  quakeDetail: (id: string) => ['earth', 'jma-quake-detail', id] as const,
  tsunami: () => ['earth', 'jma-tsunami'] as const,
  cyclones: () => ['earth', 'jma-typhoon'] as const,
  thunder: () => ['earth', 'jma-thunder'] as const,
  information: () => ['earth', 'jma-information'] as const,
  volcanoes: () => ['earth', 'jma-volcano'] as const,
  kikikuru: () => ['earth', 'jma-risk'] as const,
  river: (lat: number, lon: number) => ['earth', 'river', lat, lon] as const,
  strokes: () => ['earth', 'jma-liden'] as const,
  sample: (kind: string, frame: string, lat: number, lon: number, r: number) =>
    ['earth', 'sample', kind, frame, lat, lon, r] as const,
  tsunamiAreas: () => ['earth', 'jma-tsunami-areas'] as const,
}

/** Signals from tsunami bulletins: the highest class currently stated. */
export function tsunamiSignals(
  reports: SourceObservation<TsunamiReport>[] | undefined,
): EarthSignals {
  const ranks = (reports ?? [])
    .filter((r) => !r.data.cancelled)
    .flatMap((r) => r.data.forecasts.map((f) => tsunamiKindRank(f.kindCode)))
  return { tsunamiMaxRank: Math.max(0, ...ranks) }
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

export function useTsunamiReports() {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: earthKeys.tsunami(),
    queryFn: async ({ signal }) => unwrap(await provider.earth.tsunami.reports(signal)),
    staleTime: 20_000,
    refetchInterval: adaptive<Unwrapped<SourceObservation<TsunamiReport>[]>>(
      'jma-tsunami',
      (d) => tsunamiSignals(d?.data),
      provider.now,
    ),
    meta: { persist: true },
  })
}

export function useTsunamiAreas() {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: earthKeys.tsunamiAreas(),
    queryFn: async ({ signal }) => unwrap(await provider.earth.tsunami.areas(signal)).data,
    staleTime: Infinity,
  })
}

/** Tsunami events + per-area assessments, and the coasts near the monitoring location. */
export function useTsunami() {
  const reports = useTsunamiReports()
  const areas = useTsunamiAreas()
  const { events: quakes } = useQuakeEvents()
  const { location } = useResolvedLocation()
  const fused = useMemo(() => fuseTsunami(reports.data?.data ?? [], quakes), [reports.data, quakes])
  const localCodes = useMemo(
    () => (areas.data ? nearbyAreaCodes(areas.data, location) : []),
    [areas.data, location],
  )
  return { ...fused, reports, areas, localCodes }
}

export function useCycloneReports() {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: earthKeys.cyclones(),
    queryFn: async ({ signal }) => unwrap(await provider.earth.atmosphere.cyclones(signal)),
    staleTime: 60_000,
    refetchInterval: adaptive<Unwrapped<SourceObservation<CycloneReport>[]>>(
      'jma-typhoon',
      (d) => ({ cycloneActive: (d?.data.length ?? 0) > 0 }),
      provider.now,
    ),
    meta: { persist: true },
  })
}

export function useCyclones() {
  const q = useCycloneReports()
  const events = useMemo(() => (q.data?.data ?? []).map(cycloneEvent), [q.data])
  return { events, query: q }
}

export function useKikikuru() {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: earthKeys.kikikuru(),
    queryFn: async ({ signal }) => unwrap(await provider.earth.hydrology.kikikuru(signal)).data,
    staleTime: 60_000,
    refetchInterval: nominalPollMs('jma-risk'),
  })
}

export function useRiver() {
  const provider = useWeatherProvider()
  const { location } = useResolvedLocation()
  const lat = Math.round(location.lat * 100) / 100
  const lon = Math.round(location.lon * 100) / 100
  return useQuery({
    queryKey: earthKeys.river(lat, lon),
    queryFn: async ({ signal }) =>
      unwrap(await provider.earth.hydrology.river({ lat, lon }, signal)),
    staleTime: 60 * 60_000,
    refetchInterval: nominalPollMs('openmeteo-flood'),
    meta: { persist: true },
  })
}

/** Today's modeled discharge and the forecast peak (with its date). */
export function dischargeSummary(points: PointSeries<'discharge'>['points'], now: Instant) {
  const today = points.find((p) => p.time.slice(0, 10) === now.slice(0, 10))
  const future = points.filter((p) => p.role === 'forecast')
  const peak = future.reduce<(typeof future)[number] | null>(
    (m, p) => ((p.values.discharge ?? -1) > (m?.values.discharge ?? -1) ? p : m),
    null,
  )
  return {
    today: today?.values.discharge ?? null,
    peak: peak?.values.discharge ?? null,
    peakAt: peak?.time,
  }
}

export function useVolcanoFeed() {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: earthKeys.volcanoes(),
    queryFn: async ({ signal }) => unwrap(await provider.earth.volcano.volcanoes(signal)),
    staleTime: 60_000,
    refetchInterval: nominalPollMs('jma-volcano'),
    meta: { persist: true },
  })
}

export function useVolcanoes() {
  const q = useVolcanoFeed()
  const fused = useMemo(() => fuseVolcanoes(q.data?.data.reports ?? []), [q.data])
  return { ...fused, sites: q.data?.data.sites ?? [], query: q }
}

export function useInformation() {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: earthKeys.information(),
    queryFn: async ({ signal }) => unwrap(await provider.earth.atmosphere.information(signal)),
    staleTime: 60_000,
    refetchInterval: nominalPollMs('jma-information'),
    meta: { persist: true },
  })
}

export function useThunder() {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: earthKeys.thunder(),
    queryFn: async ({ signal }) => unwrap(await provider.earth.atmosphere.thunder(signal)).data,
    staleTime: 60_000,
    refetchInterval: nominalPollMs('jma-thunder'),
  })
}

export function useStrokes() {
  const provider = useWeatherProvider()
  return useQuery({
    queryKey: earthKeys.strokes(),
    queryFn: async ({ signal }) => unwrap(await provider.earth.atmosphere.strokes(signal)),
    staleTime: 60_000,
    refetchInterval: nominalPollMs('jma-thunder'),
  })
}

/** Newest analysed/observed frame at or before now (never a nowcast frame). */
export function presentFrame(frames: RasterFrame[], now: Instant): RasterFrame | null {
  return (
    [...frames]
      .filter((f) => (f.role === 'observed' || f.role === 'analysis') && f.validFrom <= now)
      .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0] ?? null
  )
}

/** Classified value of a field at the monitoring location, from its present frame. */
export function useLocalSample(
  kind: RasterFieldKind,
  series: RasterFieldSeries | undefined,
  radiusKm = 3,
) {
  const provider = useWeatherProvider()
  const { location } = useResolvedLocation()
  const now = useMinuteClock()
  const frame = series ? presentFrame(series.frames, now) : null
  const lat = Math.round(location.lat * 100) / 100
  const lon = Math.round(location.lon * 100) / 100
  return useQuery({
    queryKey: earthKeys.sample(kind, frame?.validFrom ?? 'none', lat, lon, radiusKm),
    queryFn: async ({ signal }) =>
      unwrap(
        await provider.earth.atmosphere.sample(
          kind,
          frame!,
          series!,
          { lat, lon },
          radiusKm,
          signal,
        ),
      ).data,
    enabled: !!frame && !!series,
    staleTime: Infinity,
  })
}

/** Every canonical natural event known to the terminal, newest first. */
export function useNaturalEvents(): { events: NaturalEvent[]; now: Instant } {
  const { events: quakes } = useQuakeEvents()
  const { events: tsunamis } = useTsunami()
  const { events: cyclones } = useCyclones()
  const { events: volcanoes } = useVolcanoes()
  const now = useMinuteClock()
  const events = useMemo<NaturalEvent[]>(
    () =>
      [...tsunamis, ...cyclones, ...volcanoes, ...quakes].sort(
        (a, b) =>
          Date.parse(b.time.startedAt ?? b.time.observedAt ?? b.time.issuedAt ?? '') -
          Date.parse(a.time.startedAt ?? a.time.observedAt ?? a.time.issuedAt ?? ''),
      ),
    [quakes, tsunamis, cyclones, volcanoes],
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

/** Feed state of a point sample: decoding problems are reported as such. */
function sampleFeed(sample: { decode: string } | undefined, failed: boolean): FeedState {
  if (!sample) return failed ? 'unavailable' : 'pending'
  if (sample.decode === 'not-decoded') return 'unavailable'
  return sample.decode === 'partial' ? 'partial' : 'ok'
}

const latestCheck = (qs: Q[]) =>
  qs
    .map((q) => q.data?.provenance.retrievedAt)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1)

export function useEarthSystems(): SystemRow[] {
  const quakes = useQuakeEvents()
  const tsunami = useTsunami()
  const cyclones = useCyclones()
  const thunder = useThunder()
  const strokes = useStrokes()
  const info = useInformation()
  const alerts = useAlerts()
  const volc = useVolcanoes()
  const kiki = useKikikuru()
  const river = useRiver()
  const land = useLocalSample('kikikuru-land', kiki.data?.land, 1)
  const inund = useLocalSample('kikikuru-inundation', kiki.data?.inundation, 1)
  const ltng = useLocalSample('lightning-activity', thunder.data?.lightning, 3)
  const torn = useLocalSample('tornado-probability', thunder.data?.tornado, 3)
  const { location } = useResolvedLocation()
  const now = useMinuteClock()
  return useMemo(() => {
    const strokeSum = strokes.data
      ? summarizeStrokes(strokes.data.data.strokes, location, now)
      : null
    const qs = [quakes.jma, quakes.usgs]
    const feed = feedState(qs, sourceSpec('jma-quake')!.freshness.staleAfterMin, now)
    const hasData = qs.some((q) => q.data)
    const ts = [tsunami.reports]
    return [
      // Tsunami first: when it is not nominal it is the most urgent line.
      {
        id: 'tsunami',
        label: 'TSUNAMI',
        reading: tsunamiStatus(tsunami.assessments, now, !!tsunami.reports.data),
        checkedAt: latestCheck(ts),
        feed: feedState(ts, sourceSpec('jma-tsunami')!.freshness.staleAfterMin, now),
        sources: ['JMA'],
      },
      {
        id: 'seismic',
        label: 'SEISMIC',
        reading: seismicStatus(quakes.events, now, hasData),
        checkedAt: latestCheck(qs),
        feed,
        sources: ['JMA', 'USGS'],
      },
      {
        id: 'cyclone',
        label: 'CYCLONE',
        reading: cycloneStatus(cyclones.events, location, !!cyclones.query.data),
        checkedAt: latestCheck([cyclones.query]),
        feed: feedState([cyclones.query], sourceSpec('jma-typhoon')!.freshness.staleAfterMin, now),
        sources: ['JMA'],
      },
      {
        id: 'volcano',
        label: 'VOLCANO',
        reading: volcanoStatus(volc.assessments, volc.sites, location, !!volc.query.data),
        checkedAt: latestCheck([volc.query]),
        feed: feedState([volc.query], sourceSpec('jma-volcano')!.freshness.staleAfterMin, now),
        sources: ['JMA'],
      },
      {
        id: 'hydro',
        label: 'HYDRO',
        reading: hydroStatus(
          inund.data?.value?.value ?? null,
          river.data ? dischargeSummary(river.data.data.points, now) : null,
          !!inund.data || !!river.data,
        ),
        checkedAt: inund.data?.validFrom,
        feed: sampleFeed(inund.data, kiki.isError),
        sources: ['JMA', 'GloFAS'],
      },
      {
        id: 'ground',
        label: 'GROUND',
        reading: groundStatus(land.data?.value?.value ?? null, !!land.data),
        checkedAt: land.data?.validFrom,
        feed: sampleFeed(land.data, kiki.isError),
        sources: ['JMA'],
      },
      {
        id: 'severe',
        label: 'SEVERE WX',
        reading: severeStatus(
          alerts.data?.data,
          info.data?.data ?? [],
          location.jma?.office,
          now,
          !!info.data || !!alerts.data,
        ),
        checkedAt: latestCheck([info]),
        feed: feedState([info], sourceSpec('jma-information')!.freshness.staleAfterMin, now),
        sources: ['JMA'],
      },
      {
        id: 'lightning',
        label: 'LIGHTNING',
        reading: lightningStatus(strokeSum, ltng.data?.value?.value ?? null, !!strokes.data),
        // Newest LIDEN 5-minute window that was received.
        checkedAt: strokes.data?.data.frames[0],
        feed:
          strokes.data?.provenance.decode === 'partial'
            ? 'partial'
            : feedState([strokes], sourceSpec('jma-thunder')!.freshness.staleAfterMin, now),
        sources: ['JMA LIDEN'],
      },
      {
        id: 'tornado',
        label: 'TORNADO',
        reading: tornadoStatus(torn.data?.value?.value ?? null, !!torn.data),
        checkedAt: torn.data?.validFrom,
        feed: sampleFeed(torn.data, thunder.isError),
        sources: ['JMA'],
      },
    ]
  }, [
    quakes.events,
    quakes.jma,
    quakes.usgs,
    tsunami.assessments,
    tsunami.reports,
    cyclones.events,
    cyclones.query,
    strokes,
    info,
    alerts.data,
    volc.assessments,
    volc.sites,
    volc.query,
    inund.data,
    land.data,
    river.data,
    kiki.isError,
    ltng.data,
    torn.data,
    thunder.isError,
    location,
    now,
  ])
}
