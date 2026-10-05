/**
 * SWPC statements → SpaceWeatherEvents (geomagnetic storms, radiation storms,
 * radio blackouts, flares). Only alerts/warnings that name a NOAA scale or a
 * K-index of 5+ become events; routine summaries stay in the panel.
 */
import type { SpaceWeatherEvent } from '@/domain/earth/events'
import type { Provenance } from '@/domain/model'
import type { SpaceWeather, SwpcAlert } from '@/sources/swpc'

function kindOf(a: SwpcAlert): SpaceWeatherEvent['detail']['kind'] {
  if (a.scale?.startsWith('G') || /K-index|Geomagnetic/i.test(a.title)) return 'geomagnetic-storm'
  if (a.scale?.startsWith('S') || /Proton/i.test(a.title)) return 'radiation-storm'
  if (a.scale?.startsWith('R') || /X-ray/i.test(a.title)) return 'flare'
  return 'alert'
}

export function significant(a: SwpcAlert): boolean {
  if (!/^(ALERT|WARNING|WATCH)/.test(a.kind)) return false
  const k = /K-index of (\d)/i.exec(a.title)
  return !!a.scale || (k != null && Number(k[1]) >= 5)
}

export function spaceEvents(sw: SpaceWeather, provenance: Provenance): SpaceWeatherEvent[] {
  return sw.alerts.filter(significant).map((a) => ({
    id: `space-weather:swpc:${a.productId}:${a.issuedAt}`,
    category: 'space-weather',
    title: `${a.kind} ${a.title}`.trim(),
    // Space weather is not tied to a place on Earth; [0, 0] is a placeholder.
    geometry: { type: 'Point', coordinates: [0, 0] },
    time: { issuedAt: a.issuedAt, startedAt: a.issuedAt },
    lifecycle: 'ongoing',
    measures: [],
    assessments: [],
    sources: [{ source: 'swpc', nativeId: a.id }],
    derivation: 'measured',
    provenance: { ...provenance, issuedAt: a.issuedAt, sourceRole: 'warning', role: 'observed' },
    detail: { kind: kindOf(a), productId: a.productId, message: a.title },
  }))
}
