import { describe, expect, it } from 'vitest'
import type { CurrentConditions, Provenance, StationObservation } from '@/domain/model'
import { SourceFailure } from '@/domain/result'
import { mergeCurrent } from './current'
import { healthFromSnapshot } from './health'

const now = '2026-10-04T16:24:00+09:00'
const model: Provenance = { source: 'openmeteo', kind: 'model', label: 'JMA MSM', retrievedAt: now }

const modelCurrent: CurrentConditions = {
  temperature: { value: 23.0, provenance: model },
  humidity: { value: 70, provenance: model },
  pressure: { value: 1009.0, provenance: model },
  visibility: { value: 18, provenance: model },
  cloudCover: { value: 60, provenance: model },
}

function station(over: Partial<StationObservation>): StationObservation {
  return {
    id: 's1',
    name: '東京',
    lat: 35.69,
    lon: 139.75,
    distanceKm: 2,
    observedAt: '2026-10-04T16:20:00+09:00',
    temperature: 24.3,
    humidity: null,
    pressure: null,
    precipitation1h: 0,
    windSpeed: 4.8,
    windDirection: 45,
    gust: 8.7,
    sunshine1h: 30,
    visibility: null,
    ...over,
  }
}

describe('mergeCurrent', () => {
  it('prefers observations per field and fills gaps from the model', () => {
    const c = mergeCurrent({ model: modelCurrent, stations: [station({})], now })
    expect(c.temperature).toMatchObject({
      value: 24.3,
      provenance: { kind: 'observation', label: 'AMeDAS 東京' },
    })
    expect(c.humidity?.provenance.kind).toBe('model')
    expect(c.cloudCover?.provenance.kind).toBe('model')
  })

  it('takes a field from a farther station when the nearest lacks it', () => {
    const near = station({ id: 'a', name: '練馬', distanceKm: 3 })
    const far = station({ id: 'b', name: '羽田', distanceKm: 14, humidity: 66, pressure: 1008.1 })
    const c = mergeCurrent({ model: modelCurrent, stations: [far, near], now })
    expect(c.temperature?.provenance.label).toBe('AMeDAS 練馬')
    expect(c.humidity).toMatchObject({
      value: 66,
      provenance: { label: 'AMeDAS 羽田', distanceKm: 14 },
    })
  })

  it('ignores stations that are too far or too old', () => {
    const far = station({ distanceKm: 35 })
    const old = station({ id: 'x', observedAt: '2026-10-04T15:40:00+09:00' })
    const c = mergeCurrent({ model: modelCurrent, stations: [far, old], now })
    expect(c.temperature?.provenance.kind).toBe('model')
  })

  it('derives dew point only when T and RH come from the same station', () => {
    const c = mergeCurrent({ model: modelCurrent, stations: [station({ humidity: 60 })], now })
    expect(c.dewPoint?.provenance.kind).toBe('observation')
    expect(c.dewPoint?.value).toBeCloseTo(16.0, 0)
  })
})

describe('healthFromSnapshot', () => {
  const opts = { now, maxAgeMin: 40, browserOnline: true }
  const t = Date.parse(now)

  it('is online and fresh after a recent success', () => {
    const h = healthFromSnapshot(
      'jma-amedas',
      {
        hasData: true,
        dataUpdatedAt: t,
        errorUpdatedAt: 0,
        error: null,
        isFetching: false,
        dataTime: now,
      },
      opts,
    )
    expect(h).toMatchObject({ connectivity: 'online', freshness: 'fresh', validity: 'valid' })
  })

  it('is offline-with-cache when the last attempt failed, and stale when data is old', () => {
    const h = healthFromSnapshot(
      'jma-amedas',
      {
        hasData: true,
        dataUpdatedAt: t - 3_600_000,
        errorUpdatedAt: t,
        error: new SourceFailure('jma-amedas', { kind: 'network', message: 'x', retryable: true }),
        isFetching: false,
        dataTime: '2026-10-04T15:20:00+09:00',
      },
      opts,
    )
    expect(h).toMatchObject({
      connectivity: 'offline',
      freshness: 'stale',
      errorMessage: 'NETWORK',
    })
  })

  it('flags failures during retries, before the query enters error state', () => {
    const h = healthFromSnapshot(
      'openmeteo',
      {
        hasData: false,
        dataUpdatedAt: 0,
        errorUpdatedAt: 0,
        error: new Error('x'),
        isFetching: true,
        failureCount: 1,
      },
      opts,
    )
    expect(h.connectivity).toBe('offline')
  })

  it('marks schema-invalid responses as invalid', () => {
    const h = healthFromSnapshot(
      'openmeteo',
      {
        hasData: false,
        dataUpdatedAt: 0,
        errorUpdatedAt: t,
        error: new SourceFailure('openmeteo', {
          kind: 'invalid_response',
          message: 'bad',
          retryable: false,
        }),
        isFetching: false,
      },
      opts,
    )
    expect(h.validity).toBe('invalid')
  })
})
