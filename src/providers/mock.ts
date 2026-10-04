/**
 * Mock provider: serves synthetic data through the same WeatherProvider
 * contract as the live provider. Supports a pinned clock, latency and
 * failure injection so every UI state can be reproduced.
 */
import type { Provenance, SourceId, WeatherLocation } from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import { toInstant, type Instant } from '@/domain/time'
import type { PlaceCandidate, WeatherProvider } from '@/services/provider'
import {
  modelCurrentFrom,
  synthAlerts,
  synthDaily,
  synthHourly,
  synthNowcastFrames,
  synthOfficialForecast,
  synthStations,
  synthWindField,
} from '@/sources/mock/generator'

export type MockOptions = {
  /** Fixed clock (ISO). When omitted, the real clock is used. */
  clock?: Instant
  /** Simulated latency range in ms */
  latency?: [number, number]
  /** Sources that should fail */
  fail?: SourceId[]
}

const PLACES: PlaceCandidate[] = [
  { name: '東京', admin: '東京都千代田区', lat: 35.6812, lon: 139.7671 },
  { name: '大阪', admin: '大阪府大阪市', lat: 34.6937, lon: 135.5023 },
  { name: '名古屋', admin: '愛知県名古屋市', lat: 35.1815, lon: 136.9066 },
  { name: '札幌', admin: '北海道札幌市', lat: 43.0621, lon: 141.3544 },
  { name: '仙台', admin: '宮城県仙台市', lat: 38.2682, lon: 140.8694 },
  { name: '福岡', admin: '福岡県福岡市', lat: 33.5904, lon: 130.4017 },
  { name: '那覇', admin: '沖縄県那覇市', lat: 26.2124, lon: 127.6809 },
  { name: '新潟', admin: '新潟県新潟市', lat: 37.9161, lon: 139.0364 },
]

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

export function createMockProvider(opts: MockOptions = {}): WeatherProvider {
  const [minLat, maxLat] = opts.latency ?? [120, 420]
  const failing = new Set(opts.fail ?? [])
  const now = () => opts.clock ?? toInstant(Date.now())

  async function run<T>(
    source: SourceId,
    kind: Provenance['kind'],
    label: string,
    signal: AbortSignal | undefined,
    make: (prov: Provenance) => T,
  ): Promise<SourceResult<T>> {
    try {
      await sleep(minLat + Math.random() * (maxLat - minLat), signal)
    } catch {
      return { ok: false, source, error: { kind: 'aborted', message: 'aborted', retryable: false } }
    }
    if (failing.has(source)) {
      return {
        ok: false,
        source,
        error: { kind: 'network', message: 'Injected failure (mock)', retryable: true },
      }
    }
    const prov: Provenance = { source, kind, label, retrievedAt: toInstant(Date.now()) }
    return { ok: true, data: make(prov), provenance: prov }
  }

  return {
    id: 'mock',
    now,
    forecast: (_p, signal) =>
      run('openmeteo', 'model', 'MOCK MODEL', signal, (prov) => {
        const t = now()
        const hourly = synthHourly(t)
        return {
          current: modelCurrentFrom(hourly, t, prov),
          hourly: { points: hourly, provenance: { ...prov, kind: 'forecast', validFrom: t } },
          daily: { days: synthDaily(hourly, t), provenance: { ...prov, kind: 'forecast' } },
        }
      }),
    stations: (p, signal) =>
      run('jma-amedas', 'observation', 'MOCK AMeDAS', signal, () => {
        const t = now()
        return synthStations(p.lat, p.lon, synthHourly(t, 24, 24), t)
      }),
    alerts: (_loc, signal) =>
      run('jma-warning', 'official', 'MOCK JMA', signal, (prov) => synthAlerts(now(), prov)),
    officialForecast: (_loc, signal) =>
      run('jma-forecast', 'official', 'MOCK JMA', signal, (prov) =>
        synthOfficialForecast(now(), prov),
      ),
    nowcastFrames: (signal) =>
      run('jma-nowcast', 'observation', 'MOCK NOWCAST', signal, () => synthNowcastFrames(now())),
    windField: (p, signal) =>
      run('openmeteo', 'model', 'MOCK MODEL', signal, () => synthWindField(p.lat, p.lon, now())),
    resolveLocation: (p, signal) =>
      run('gsi-geocoder', 'official', 'MOCK GSI', signal, (): WeatherLocation => {
        const nearest = PLACES.reduce((a, b) =>
          Math.hypot(b.lat - p.lat, b.lon - p.lon) < Math.hypot(a.lat - p.lat, a.lon - p.lon)
            ? b
            : a,
        )
        return {
          lat: p.lat,
          lon: p.lon,
          name: nearest.admin ?? nearest.name,
          subName: nearest.name === '東京' ? '丸の内' : undefined,
          muniCode: '13101',
          jma: { office: '130000', class10: '130010', class20: '1310100', officeName: '東京都' },
          origin: p.origin,
        }
      }),
    searchPlaces: (query, signal) =>
      run('openmeteo-geocoder', 'official', 'MOCK GEOCODER', signal, () =>
        PLACES.filter((pl) => pl.name.includes(query) || (pl.admin ?? '').includes(query)),
      ),
  }
}

/** Read mock options from the URL: ?clock=…&fail=openmeteo,jma-warning */
export function mockOptionsFromUrl(search: string): MockOptions {
  const q = new URLSearchParams(search)
  const clock = q.get('clock') ?? undefined
  const fail = q.get('fail')?.split(',').filter(Boolean) as SourceId[] | undefined
  const latency = q.has('nolatency') ? ([0, 0] as [number, number]) : undefined
  return { clock, fail, latency }
}
