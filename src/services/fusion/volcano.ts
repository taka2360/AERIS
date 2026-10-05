/**
 * Volcano bulletin → VolcanoEvent (the volcano's state as stated) plus a
 * HazardAssessment (JMA's eruption warning / forecast).
 */
import type { HazardAssessment } from '@/domain/earth/assessments'
import { refKey, type SourceObservation } from '@/domain/earth/common'
import type { VolcanoEvent } from '@/domain/earth/events'
import { alertLevelOf, volcanoRank, type VolcanoReport } from '@/domain/earth/reports'

export function volcanoAssessment(obs: SourceObservation<VolcanoReport>): HazardAssessment {
  const r = obs.data
  return {
    id: `jma-volcano:${r.site.code}:${r.issuedAt}`,
    eventRef: `volcano:${refKey(obs)}`,
    scheme: 'jma-volcano',
    level: { value: r.levelCode, label: r.levelName },
    rank: volcanoRank(r.levelCode),
    area: { code: r.site.code, name: r.site.name },
    // A bulletin stays in force until JMA issues the next one.
    time: { issuedAt: r.issuedAt, validFrom: r.issuedAt },
    status: r.condition === '継続' ? 'continued' : 'issued',
    sourceRole: 'warning',
    values: r.condition ? { condition: r.condition } : {},
    provenance: obs.provenance,
  }
}

export function volcanoEvent(
  obs: SourceObservation<VolcanoReport>,
  a: HazardAssessment,
): VolcanoEvent {
  const r = obs.data
  return {
    id: `volcano:${refKey(obs)}`,
    category: 'volcano',
    title: r.site.name,
    place: r.site.name,
    geometry: { type: 'Point', coordinates: [r.site.lon, r.site.lat] },
    time: { issuedAt: r.issuedAt },
    lifecycle: 'ongoing',
    measures: [],
    assessments: [{ id: a.id, scheme: a.scheme }],
    sources: [{ source: obs.source, nativeId: obs.nativeId }],
    derivation: 'measured',
    provenance: obs.provenance,
    detail: {
      volcanoCode: r.site.code,
      nameEn: r.site.nameEn,
      levelCode: r.levelCode,
      levelName: r.levelName,
      alertLevel: alertLevelOf(r.levelCode),
      condition: r.condition,
      notes: r.municipalities,
    },
  }
}

export function fuseVolcanoes(reports: SourceObservation<VolcanoReport>[]) {
  const assessments = reports.map(volcanoAssessment)
  const events = reports.map((o, i) => volcanoEvent(o, assessments[i]!))
  return { events, assessments }
}
