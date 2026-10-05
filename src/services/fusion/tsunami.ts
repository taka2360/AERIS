/**
 * JMA tsunami report → one TsunamiEvent (the phenomenon) plus one
 * HazardAssessment per forecast area (JMA's statement for that coast).
 * The event links to its earthquake by JMA event id; nothing is merged.
 */
import type { HazardAssessment } from '@/domain/earth/assessments'
import { refKey, type SourceObservation } from '@/domain/earth/common'
import type { EarthquakeEvent, TsunamiEvent } from '@/domain/earth/events'
import type { TsunamiReport } from '@/domain/earth/reports'
import { tsunamiKindRank } from '@/sources/jma-tsunami'

/** Japan's centre, used when a bulletin carries no hypocentre (e.g. distant source). */
const JAPAN: [number, number] = [137.5, 36.5]

export function tsunamiAssessments(obs: SourceObservation<TsunamiReport>): HazardAssessment[] {
  const r = obs.data
  return r.forecasts.map((f) => {
    const rank = tsunamiKindRank(f.kindCode)
    const values: Record<string, string> = {}
    if (f.maxHeight) values.maxHeight = f.maxHeight
    if (f.maxHeightCondition) values.maxHeightCondition = f.maxHeightCondition
    if (f.firstArrival) values.firstArrival = f.firstArrival
    if (f.firstArrivalCondition) values.firstArrivalCondition = f.firstArrivalCondition
    return {
      id: `jma-tsunami:${r.eventId}:${f.areaCode}`,
      eventRef: `tsunami:${refKey(obs)}`,
      scheme: 'jma-tsunami',
      level: { value: f.kindCode, label: f.kindName },
      rank,
      area: { code: f.areaCode, name: f.areaName },
      time: {
        issuedAt: r.issuedAt,
        validFrom: r.issuedAt,
        // 予報 carries an end time; warnings stay until JMA clears them.
        validUntil: rank <= 1 ? r.validUntil : undefined,
      },
      status:
        r.cancelled || rank === 0
          ? 'cancelled'
          : f.lastKindCode && f.lastKindCode === f.kindCode
            ? 'continued'
            : 'issued',
      sourceRole: 'warning',
      values,
      provenance: obs.provenance,
    }
  })
}

export function tsunamiEvent(
  obs: SourceObservation<TsunamiReport>,
  assessments: HazardAssessment[],
  quakes: EarthquakeEvent[],
): TsunamiEvent {
  const r = obs.data
  const quake = quakes.find((q) =>
    q.sources.some((s) => s.source === 'jma-quake' && s.nativeId === r.eventId),
  )
  const active = assessments.filter((a) => a.status !== 'cancelled')
  const o = r.origin
  return {
    id: `tsunami:${refKey(obs)}`,
    category: 'tsunami',
    title: `${o?.areaName ?? '震源不明'} 津波`,
    place: o?.areaName,
    geometry: {
      type: 'Point',
      coordinates: o?.lat != null && o.lon != null ? [o.lon, o.lat] : JAPAN,
    },
    time: { startedAt: o?.time, issuedAt: r.issuedAt, validUntil: r.validUntil },
    lifecycle: r.cancelled ? 'cancelled' : active.length > 0 ? 'ongoing' : 'ended',
    measures:
      o?.magnitude != null
        ? [
            {
              kind: 'earthquake.magnitude',
              value: o.magnitude,
              variant: 'Mj',
              role: 'observed',
              provenance: obs.provenance,
            },
          ]
        : [],
    assessments: assessments.map((a) => ({ id: a.id, scheme: a.scheme })),
    sources: [{ source: obs.source, nativeId: obs.nativeId }],
    related: quake ? [{ id: quake.id, relation: 'triggered-by' }] : undefined,
    derivation: 'measured',
    provenance: obs.provenance,
    detail: {
      originEventRef: quake?.id,
      observations: r.observations.map((x) => ({
        station: x.station,
        arrivalAt: x.firstArrival,
        maxHeightM: x.maxHeight ? Number.parseFloat(x.maxHeight) || undefined : undefined,
        condition: x.condition,
      })),
      headline: r.headline,
    },
  }
}

export function fuseTsunami(
  reports: SourceObservation<TsunamiReport>[],
  quakes: EarthquakeEvent[],
): { events: TsunamiEvent[]; assessments: HazardAssessment[] } {
  const assessments: HazardAssessment[] = []
  const events: TsunamiEvent[] = []
  for (const obs of reports) {
    const a = tsunamiAssessments(obs)
    assessments.push(...a)
    events.push(tsunamiEvent(obs, a, quakes))
  }
  return { events, assessments }
}
