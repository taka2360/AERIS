/**
 * Tropical cyclone report → CycloneEvent. One agency's issuance per event;
 * analysis values are measures with the issuance's provenance.
 */
import { refKey, type EventMeasure, type SourceObservation } from '@/domain/earth/common'
import type { CycloneEvent } from '@/domain/earth/events'
import type { CycloneReport } from '@/domain/earth/reports'

/** '2627' → '台風第27号' (JMA numbers are YYNN). */
export function typhoonTitle(r: CycloneReport): string {
  const nn = r.number ? Number(r.number.slice(-2)) : null
  const name = r.name ? ` ${r.name}` : ''
  // A depression that was never named a typhoon has no number.
  if (!nn) return r.category === 'LOW' ? '温帯低気圧' : '熱帯低気圧'
  const base = `台風第${nn}号${name}`
  if (r.category === 'LOW') return `温帯低気圧(旧${base})`
  if (r.category === 'TD') return `熱帯低気圧(旧${base})`
  return base
}

export function cycloneEvent(obs: SourceObservation<CycloneReport>): CycloneEvent {
  const r = obs.data
  const p = r.detail.observedPosition
  const m = (
    kind: EventMeasure['kind'],
    value: number | undefined,
    unit: string,
  ): EventMeasure[] =>
    value == null ? [] : [{ kind, value, unit, role: 'analysis', provenance: obs.provenance }]
  return {
    id: `tropical-cyclone:${refKey(obs)}`,
    category: 'tropical-cyclone',
    title: typhoonTitle(r),
    place: r.location,
    geometry: { type: 'Point', coordinates: p ? [p.lon, p.lat] : [140, 25] },
    time: { observedAt: p?.validAt, issuedAt: r.issuedAt },
    lifecycle: 'ongoing',
    measures: [
      ...m('cyclone.central_pressure', p?.pressureHpa, 'hPa'),
      ...m('cyclone.max_wind', p?.maxWindMs, 'm/s'),
      ...m('cyclone.max_gust', r.maxGustMs, 'm/s'),
      ...m('cyclone.speed', r.detail.movement?.speedKmh, 'km/h'),
    ],
    assessments: [],
    sources: [{ source: obs.source, nativeId: obs.nativeId }],
    derivation: 'measured',
    provenance: obs.provenance,
    detail: r.detail,
  }
}
