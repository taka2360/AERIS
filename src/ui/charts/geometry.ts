/**
 * Chart geometry helpers. Plots use a fixed viewBox (VB_W × VB_H) stretched to
 * the container with preserveAspectRatio="none" and non-scaling strokes, so
 * resizing never re-renders SVG. All text lives in HTML.
 */
import { scaleLinear } from 'd3-scale'
import { curveMonotoneX, line, area } from 'd3-shape'

export const VB_W = 1000
export const VB_H = 100

export function xAt(i: number, n: number): number {
  return n <= 1 ? 0 : (i / (n - 1)) * VB_W
}

export function niceDomain(
  values: Array<number | null>,
  minSpan: number,
  pad = 0.12,
): [number, number] {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x))
  if (v.length === 0) return [0, minSpan]
  let lo = Math.min(...v)
  let hi = Math.max(...v)
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2
    lo = mid - minSpan / 2
    hi = mid + minSpan / 2
  }
  const p = (hi - lo) * pad
  return [lo - p, hi + p]
}

export function yScale(domain: [number, number], top = 6, bottom = VB_H - 6) {
  return scaleLinear().domain(domain).range([bottom, top])
}

/** Build an SVG path for a series, skipping gaps (null values). */
export function linePath(
  values: Array<number | null>,
  y: (v: number) => number,
  smooth = true,
): string {
  const n = values.length
  const gen = line<number | null>()
    .defined((v) => v != null)
    .x((_, i) => xAt(i, n))
    .y((v) => y(v as number))
  if (smooth) gen.curve(curveMonotoneX)
  return gen(values) ?? ''
}

export function areaPath(
  values: Array<number | null>,
  y: (v: number) => number,
  baseline: number,
): string {
  const n = values.length
  return (
    area<number | null>()
      .defined((v) => v != null)
      .x((_, i) => xAt(i, n))
      .y0(baseline)
      .y1((v) => y(v as number))
      .curve(curveMonotoneX)(values) ?? ''
  )
}

/** Percentage position for HTML overlays. */
export function pct(i: number, n: number): string {
  return `${(n <= 1 ? 0 : (i / (n - 1)) * 100).toFixed(3)}%`
}
