/**
 * Volcanoes: every monitored volcano as a dim triangle; those with a JMA
 * bulletin listed are coloured by rank and labelled with JMA's own wording.
 * Clicking any triangle opens its detail (a quiet volcano included).
 */
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { FONT, MAP_COLORS } from '../style'
import type { MapLayerDef, MapScene } from './types'

const RANK_COLOR = ['#7a6f55', '#a89a78', '#ffe14a', '#ffb000', '#ff5536', '#c18bff']

function triangleImage(): ImageData {
  const size = 24
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.beginPath()
  g.moveTo(size / 2, 3)
  g.lineTo(size - 3, size - 4)
  g.lineTo(3, size - 4)
  g.closePath()
  g.fill()
  return g.getImageData(0, 0, size, size)
}

function volcanoesGeoJSON(s: MapScene) {
  return {
    type: 'FeatureCollection' as const,
    features: s.volcanoes.map((v) => ({
      type: 'Feature' as const,
      properties: {
        id: v.selectId,
        rank: v.rank,
        label: v.rank >= 2 ? `${v.name} ${v.levelShort}` : v.name,
        sel: v.selectId === s.selectedEventId ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] },
    })),
  }
}

const rankColor = [
  'match',
  ['get', 'rank'],
  ...RANK_COLOR.flatMap((c, i) => [i, c]),
  RANK_COLOR[0],
] as unknown as string

export const volcanoLayer: MapLayerDef = {
  id: 'volcanoes',
  toggle: 'volcano',
  styleLayers: ['volcanoes', 'volcano-labels'],
  add(map, s, handlers) {
    if (!map.hasImage('volcano-tri'))
      map.addImage('volcano-tri', triangleImage(), { pixelRatio: 2, sdf: true })
    map.addSource('volcanoes', { type: 'geojson', data: volcanoesGeoJSON(s) })
    map.addLayer({
      id: 'volcanoes',
      type: 'symbol',
      source: 'volcanoes',
      layout: {
        'icon-image': 'volcano-tri',
        'icon-size': ['interpolate', ['linear'], ['get', 'rank'], 0, 0.8, 2, 1.1, 5, 1.6],
        'icon-allow-overlap': true,
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: {
        'icon-color': rankColor,
        'icon-opacity': ['case', ['>=', ['get', 'rank'], 2], 1, 0.55],
        'icon-halo-color': ['case', ['==', ['get', 'sel'], 1], MAP_COLORS.text, MAP_COLORS.bg],
        'icon-halo-width': ['case', ['==', ['get', 'sel'], 1], 2, 1],
      },
    })
    map.addLayer({
      id: 'volcano-labels',
      type: 'symbol',
      source: 'volcanoes',
      filter: ['any', ['>=', ['get', 'rank'], 2], ['==', ['get', 'sel'], 1]],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT,
        'text-size': 10,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': rankColor, 'text-halo-color': MAP_COLORS.bg, 'text-halo-width': 1.2 },
    })
    map.on('click', 'volcanoes', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id
      if (id) handlers().onSelect(String(id))
    })
    map.on('mouseenter', 'volcanoes', () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', 'volcanoes', () => (map.getCanvas().style.cursor = ''))
  },
  deps: (s) => [s.volcanoes, s.selectedEventId],
  update(map, s) {
    ;(map.getSource('volcanoes') as GeoJSONSource | undefined)?.setData(volcanoesGeoJSON(s))
  },
}
