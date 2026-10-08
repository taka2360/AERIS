/**
 * Tropical cyclones: past path (observed, amber), forecast track and
 * probability circles (forecast, cyan), storm / gale areas, and the centre
 * at the cursor time — interpolated within one issuance, absent when the
 * cursor is outside what the agency stated. Each forecast point carries its
 * valid date and time (JST).
 */
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { splitAtAntimeridian } from '@/domain/earth/common'
import { formatShortDate, formatTime, formatWeekday } from '@/domain/time'
import { destination } from '../geo'
import { FONT, MAP_COLORS } from '../style'
import { pickPoint, type MapLayerDef, type MapScene } from './types'

function circle(lat: number, lon: number, km: number, steps = 64): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const p = destination(lat, lon, (i / steps) * 360, km)
    return [p.lon, p.lat] as [number, number]
  })
}

type F = {
  type: 'Feature'
  properties: Record<string, string | number>
  geometry:
    | { type: 'MultiLineString'; coordinates: [number, number][][] }
    | { type: 'Point'; coordinates: [number, number] }
}

const line = (coords: [number, number][], props: Record<string, string | number>): F => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'MultiLineString', coordinates: splitAtAntimeridian(coords) },
})

function cycloneGeoJSON(s: MapScene) {
  const features: F[] = []
  for (const c of s.cyclones) {
    const sel = c.id === s.selectedEventId ? 1 : 0
    if (c.path.length > 1) features.push(line(c.path, { kind: 'path', id: c.id, sel }))
    const fc = c.points.filter((p) => p.role === 'forecast')
    const a = c.points.find((p) => p.role !== 'forecast')
    if (a && fc.length)
      features.push(
        line([[a.lon, a.lat], ...fc.map((p) => [p.lon, p.lat] as [number, number])], {
          kind: 'track',
          id: c.id,
          sel,
        }),
      )
    for (const p of fc) {
      if (p.circleKm)
        features.push(line(circle(p.lat, p.lon, p.circleKm), { kind: 'circle', id: c.id, sel }))
      features.push({
        type: 'Feature',
        properties: {
          kind: 'fpoint',
          id: c.id,
          sel,
          label: `${formatShortDate(p.validAt)} ${formatWeekday(p.validAt)} ${formatTime(p.validAt, false)}`,
        },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })
    }
    for (const t of c.coneLines) features.push(line(t, { kind: 'cone', id: c.id, sel }))
    if (a?.stormAreaKm)
      features.push(line(circle(a.lat, a.lon, a.stormAreaKm), { kind: 'storm', id: c.id, sel }))
    for (const t of c.stormLines) features.push(line(t, { kind: 'storm-fcst', id: c.id, sel }))
    if (c.gale)
      features.push(
        line(circle(c.gale.lat, c.gale.lon, c.gale.radiusKm), { kind: 'gale', id: c.id, sel }),
      )
    if (c.at)
      features.push({
        type: 'Feature',
        properties: { kind: 'centre', id: c.id, role: c.at.role, label: c.label, sel },
        geometry: { type: 'Point', coordinates: [c.at.lon, c.at.lat] },
      })
  }
  return { type: 'FeatureCollection' as const, features }
}

const KIND_COLOR = [
  'match',
  ['get', 'kind'],
  'path',
  MAP_COLORS.amber,
  'storm',
  '#ff5536',
  'storm-fcst',
  '#ff5536',
  'gale',
  '#ffe14a',
  MAP_COLORS.cyan,
] as unknown as string

export const cycloneLayer: MapLayerDef = {
  id: 'cyclones',
  toggle: 'cyclone',
  styleLayers: [
    'cyclone-lines',
    'cyclone-fpoint',
    'cyclone-ftime',
    'cyclone-centre',
    'cyclone-label',
  ],
  add(map, s, handlers) {
    map.addSource('cyclones', { type: 'geojson', data: cycloneGeoJSON(s) })
    map.addLayer({
      id: 'cyclone-lines',
      type: 'line',
      source: 'cyclones',
      filter: ['match', ['get', 'kind'], ['centre', 'fpoint'], false, true],
      paint: {
        'line-color': KIND_COLOR,
        'line-width': ['match', ['get', 'kind'], 'path', 2, 'track', 1.6, 'storm', 1.6, 1],
        'line-opacity': ['match', ['get', 'kind'], 'gale', 0.55, 'storm-fcst', 0.6, 0.9],
        'line-dasharray': [
          'match',
          ['get', 'kind'],
          'track',
          ['literal', [3, 2]],
          'circle',
          ['literal', [2, 2]],
          'cone',
          ['literal', [1, 0]],
          ['literal', [1, 0]],
        ],
      },
    })
    // Forecast points: a small mark with the valid time beside it.
    map.addLayer({
      id: 'cyclone-fpoint',
      type: 'circle',
      source: 'cyclones',
      filter: ['==', ['get', 'kind'], 'fpoint'],
      paint: {
        'circle-radius': 2.5,
        'circle-color': MAP_COLORS.bg,
        'circle-stroke-color': MAP_COLORS.cyan,
        'circle-stroke-width': 1.5,
      },
    })
    map.addLayer({
      id: 'cyclone-ftime',
      type: 'symbol',
      source: 'cyclones',
      filter: ['==', ['get', 'kind'], 'fpoint'],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT,
        'text-size': 10,
        'text-anchor': 'left',
        'text-offset': [0.8, 0],
      },
      paint: {
        'text-color': MAP_COLORS.cyan,
        'text-halo-color': MAP_COLORS.bg,
        'text-halo-width': 1.2,
      },
    })
    map.addLayer({
      id: 'cyclone-centre',
      type: 'circle',
      source: 'cyclones',
      filter: ['==', ['get', 'kind'], 'centre'],
      paint: {
        'circle-radius': ['case', ['==', ['get', 'sel'], 1], 8, 6],
        'circle-color': MAP_COLORS.bg,
        'circle-stroke-color': [
          'match',
          ['get', 'role'],
          'forecast',
          MAP_COLORS.cyan,
          MAP_COLORS.amber,
        ],
        'circle-stroke-width': 2.5,
      },
    })
    map.addLayer({
      id: 'cyclone-label',
      type: 'symbol',
      source: 'cyclones',
      filter: ['==', ['get', 'kind'], 'centre'],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT,
        'text-size': 10,
        'text-offset': [0, 1.5],
      },
      paint: {
        'text-color': MAP_COLORS.text,
        'text-halo-color': MAP_COLORS.bg,
        'text-halo-width': 1.2,
      },
    })
    map.on('click', 'cyclone-centre', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id
      if (id) handlers().onSelect(String(id), pickPoint(e))
    })
  },
  deps: (s) => [s.cyclones, s.selectedEventId],
  update(map, s) {
    ;(map.getSource('cyclones') as GeoJSONSource | undefined)?.setData(cycloneGeoJSON(s))
  },
}
