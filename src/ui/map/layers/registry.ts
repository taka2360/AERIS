/**
 * Draw order of all map overlays (first = bottom):
 * raster fields → areas → lines/tracks → points → labels.
 */
import {
  lightningLayer,
  radarLayer,
  ringsLayer,
  stationsLayer,
  strokesLayer,
  tornadoLayer,
  windLayer,
} from './base-layers'
import { cycloneLayer } from './cyclone-layer'
import { quakeLayer } from './quake-layer'
import { tsunamiLayer } from './tsunami-layer'
import { volcanoLayer } from './volcano-layer'
import type { MapLayerDef } from './types'

export const MAP_LAYERS: MapLayerDef[] = [
  radarLayer,
  lightningLayer,
  tornadoLayer,
  ringsLayer,
  windLayer,
  stationsLayer,
  strokesLayer,
  cycloneLayer,
  tsunamiLayer,
  volcanoLayer,
  quakeLayer,
]

/** Source ids whose tile errors are data gaps rather than basemap failure. */
export const OVERLAY_SOURCES = new Set(MAP_LAYERS.flatMap((l) => l.overlaySources ?? []))

export function depsChanged(prev: unknown[] | undefined, next: unknown[]): boolean {
  if (!prev || prev.length !== next.length) return true
  return next.some((v, i) => !Object.is(v, prev[i]))
}
