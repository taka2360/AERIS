import { describe, expect, it } from 'vitest'
import { globalStatus, wildfireStatus } from '@/domain/earth/status'
import { SourceFailure } from '@/domain/result'
import { adaptEonet, eonetObservation, eonetSchema } from '@/sources/eonet'
import eonetFixture from '@/sources/eonet/fixtures/events-open.json'
import { adaptGdacs, gdacsSchema } from '@/sources/gdacs'
import gdacsFixture from '@/sources/gdacs/fixtures/events.json'
import { synthCyclones, synthFirms, synthGdacs, synthQuakes } from '@/sources/mock/earth'
import { fuseQuakes } from './fusion/earthquake'
import { cycloneEvent } from './fusion/cyclone'
import { clusterFires, eonetEvent, gdacsEvents, linkGdacs, relateStorms } from './fusion/global'
import { healthFromSnapshot } from './health'

const now = '2026-10-04T16:24:00+09:00'
const prov = { source: 'relay-firms' as const, kind: 'observation' as const, retrievedAt: now }

describe('EONET (real open events)', () => {
  const events = adaptEonet(eonetSchema.parse(eonetFixture)).map((e) =>
    eonetEvent(eonetObservation(e, now)),
  )

  it('maps categories and keeps EONET as an aggregation (derived)', () => {
    expect(new Set(events.map((e) => e.category))).toEqual(
      new Set(['severe-storm', 'wildfire', 'sea-ice']),
    )
    for (const e of events) {
      expect(e.provenance.sourceRole).toBe('aggregation')
      expect(e.derivation).toBe('derived')
    }
  })

  it('relates (never merges) a tracked storm to the agency cyclone nearby', () => {
    const storm = events.find((e) => e.title.includes('Choi-wan'))!
    const jma = synthCyclones(now, 'quiet').map(cycloneEvent)
    const near = {
      ...jma[0]!,
      detail: {
        ...jma[0]!.detail,
        observedPosition: {
          ...jma[0]!.detail.observedPosition!,
          lat: storm.geometry.type === 'Point' ? storm.geometry.coordinates[1] : 0,
          lon: storm.geometry.type === 'Point' ? storm.geometry.coordinates[0] : 0,
        },
      },
    }
    const [related] = relateStorms([storm], [near])
    expect(related!.related?.[0]?.id).toBe(near.id)
    expect(related!.id).not.toBe(near.id)
  })
})

describe('GDACS (real list)', () => {
  const a = adaptGdacs(gdacsSchema.parse(gdacsFixture), now)

  it('is an assessment with Green/Orange/Red ranks', () => {
    expect(a.every((x) => x.scheme === 'gdacs' && x.sourceRole === 'assessment')).toBe(true)
    expect(a.find((x) => x.values.eventtype === 'TC')?.values.severity).toContain('km/h')
  })

  it('creates events only for floods and droughts', () => {
    const ev = gdacsEvents(a)
    expect(ev.length).toBeGreaterThan(0)
    expect(ev.every((e) => e.category === 'flood' || e.category === 'other')).toBe(true)
  })

  it('links an Orange earthquake assessment to the measured quake', () => {
    const { jma, usgs } = synthQuakes(now, 'quake')
    const quakes = fuseQuakes(jma, usgs).events
    const links = linkGdacs(synthGdacs(now, 'quake'), quakes)
    const main = quakes.find((q) => q.detail.maxIntensity === '5+')!
    expect(links.get(main.id)?.[0]?.level.value).toBe('Orange')
  })
})

describe('FIRMS clusters (AERIS derived)', () => {
  const fires = clusterFires(synthFirms(now).detections, now, prov)

  it('clusters nearby detections and drops isolated ones', () => {
    expect(fires).toHaveLength(3) // Kyushu, Australia, California; the lone detection is dropped
    const kyushu = fires.find((f) => f.geometry.type === 'Point' && f.geometry.coordinates[1] > 32)!
    expect(kyushu.detail).toMatchObject({ basis: 'firms-cluster', detectionCount: 4 })
    expect(kyushu.derivation).toBe('derived')
    expect(kyushu.fieldSources?.geometry?.method).toBe('firms-cluster')
  })

  it('rates wildfire relative to the location', () => {
    expect(wildfireStatus(fires, { lat: 32.8, lon: 130.7 }, true).status).toBe('elevated')
    expect(wildfireStatus(fires, { lat: 35.68, lon: 139.77 }, true).status).toBe('active')
    expect(wildfireStatus([], { lat: 35.68, lon: 139.77 }, true).status).toBe('nominal')
  })
})

describe('global status', () => {
  it('follows the highest GDACS level in force', () => {
    expect(globalStatus(synthGdacs(now, 'quake'), [], true).status).toBe('elevated')
    expect(globalStatus([], [], true).status).toBe('nominal')
  })
})

describe('optional relay', () => {
  it('reports an unconfigured relay as standby, not as a failure', () => {
    const h = healthFromSnapshot(
      'relay-firms',
      {
        hasData: false,
        dataUpdatedAt: 0,
        errorUpdatedAt: 1,
        error: new SourceFailure('relay-firms', {
          kind: 'not_configured',
          message: 'relay not configured',
          retryable: false,
        }),
        isFetching: false,
      },
      { now, maxAgeMin: 60, browserOnline: true },
    )
    expect(h).toMatchObject({
      connectivity: 'unknown',
      freshness: 'none',
      errorMessage: 'NOT CONFIGURED',
    })
  })
})
