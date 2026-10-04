/**
 * AERIS basemap style: OpenMapTiles schema (served by OpenFreeMap) redrawn as
 * a dim instrument display — dark land, teal water, amber boundaries.
 * Weather overlays are added at runtime on top of these layers.
 */
import type { StyleSpecification } from 'maplibre-gl'

/** Mirrors styles/tokens.css — MapLibre cannot read CSS variables. */
export const MAP_COLORS = {
  bg: '#050607',
  land: '#0a0c0d',
  water: '#08161a',
  waterLine: '#1d4a52',
  park: '#0c120d',
  road: '#2a2416',
  roadMajor: '#4a3c1c',
  boundary: '#a8780c',
  boundaryMinor: '#4a3c1c',
  label: '#a89a78',
  labelMajor: '#ece0c3',
  halo: '#050607',
  amber: '#ffb000',
  amberHi: '#ffc94d',
  cyan: '#45e0e8',
  text: '#ece0c3',
} as const

export const BASEMAP_SOURCE_URL = 'https://tiles.openfreemap.org/planet'
export const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
export const FONT = ['Noto Sans Regular']

const nameJa = ['coalesce', ['get', 'name:ja'], ['get', 'name']] as unknown as string

export function buildBaseStyle(): StyleSpecification {
  const c = MAP_COLORS
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      basemap: {
        type: 'vector',
        url: BASEMAP_SOURCE_URL,
        attribution:
          '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': c.land } },
      {
        id: 'park',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'park',
        paint: { 'fill-color': c.park },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'water',
        paint: { 'fill-color': c.water },
      },
      {
        id: 'water-edge',
        type: 'line',
        source: 'basemap',
        'source-layer': 'water',
        paint: { 'line-color': c.waterLine, 'line-width': 0.6, 'line-opacity': 0.8 },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'basemap',
        'source-layer': 'waterway',
        minzoom: 8,
        paint: { 'line-color': c.waterLine, 'line-width': 0.5 },
      },
      {
        id: 'roads-minor',
        type: 'line',
        source: 'basemap',
        'source-layer': 'transportation',
        minzoom: 10,
        filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
        paint: { 'line-color': c.road, 'line-width': 0.5 },
      },
      {
        id: 'roads-major',
        type: 'line',
        source: 'basemap',
        'source-layer': 'transportation',
        minzoom: 6,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
        paint: {
          'line-color': c.roadMajor,
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 12, 1.4],
        },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'basemap',
        'source-layer': 'transportation',
        minzoom: 9,
        filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': c.road, 'line-width': 0.6, 'line-dasharray': [3, 2] },
      },
      {
        id: 'boundary-municipal',
        type: 'line',
        source: 'basemap',
        'source-layer': 'boundary',
        minzoom: 8,
        filter: ['all', ['>=', ['get', 'admin_level'], 5], ['==', ['get', 'maritime'], 0]],
        paint: { 'line-color': c.boundaryMinor, 'line-width': 0.5, 'line-dasharray': [2, 2] },
      },
      {
        id: 'boundary-pref',
        type: 'line',
        source: 'basemap',
        'source-layer': 'boundary',
        filter: ['all', ['<=', ['get', 'admin_level'], 4], ['==', ['get', 'maritime'], 0]],
        paint: {
          'line-color': c.boundary,
          'line-width': 0.8,
          'line-dasharray': [4, 2],
          'line-opacity': 0.7,
        },
      },
      {
        id: 'place-minor',
        type: 'symbol',
        source: 'basemap',
        'source-layer': 'place',
        minzoom: 9,
        filter: ['in', ['get', 'class'], ['literal', ['town', 'suburb', 'village']]],
        layout: { 'text-field': nameJa, 'text-font': FONT, 'text-size': 10, 'text-max-width': 8 },
        paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.2 },
      },
      {
        id: 'place-major',
        type: 'symbol',
        source: 'basemap',
        'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'city'],
        layout: {
          'text-field': nameJa,
          'text-font': FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 11, 13],
        },
        paint: { 'text-color': c.labelMajor, 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
      },
    ],
  }
}

/**
 * JMA hrpns tiles use a fixed 8-colour palette. AERIS repaints each tile into
 * its own palette (same bands, same order) so heavy rain still reads as
 * "hotter", while light rain no longer floods the dark display.
 * [JMA rgb] → [AERIS rgba]
 */
export const RADAR_PALETTE: Array<{
  min: number
  jma: [number, number, number]
  rgba: [number, number, number, number]
}> = [
  { min: 0, jma: [242, 242, 255], rgba: [69, 224, 232, 40] },
  { min: 1, jma: [160, 210, 255], rgba: [42, 140, 146, 120] },
  { min: 5, jma: [33, 140, 255], rgba: [69, 224, 232, 170] },
  { min: 10, jma: [0, 65, 255], rgba: [90, 130, 255, 200] },
  { min: 20, jma: [250, 245, 0], rgba: [255, 225, 74, 220] },
  { min: 30, jma: [255, 153, 0], rgba: [255, 176, 0, 230] },
  { min: 50, jma: [255, 40, 0], rgba: [255, 85, 54, 240] },
  { min: 80, jma: [180, 0, 104], rgba: [193, 139, 255, 250] },
]

const PALETTE_LOOKUP = new Map(
  RADAR_PALETTE.map((p) => [(p.jma[0] << 16) | (p.jma[1] << 8) | p.jma[2], p.rgba]),
)

/** Repaint RGBA pixels in place. Unknown colours become transparent. */
export function recolorRadarPixels(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue
    const c = PALETTE_LOOKUP.get((px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!)
    if (c) {
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
      px[i + 3] = c[3]
    } else {
      px[i + 3] = 0
    }
  }
}

export const legendColor = (rgba: [number, number, number, number]) =>
  `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${Math.max(0.5, rgba[3] / 255).toFixed(2)})`
