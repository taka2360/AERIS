/**
 * A popup tied to a map position by an elbow leader line. The line draws out
 * from the target, then the box unfolds from where the line meets it. The
 * box goes to whichever side has room (right and up preferred).
 *
 * Positioning is done straight on the DOM inside MapLibre's 'move' event —
 * the same frame the map is drawn in. Going through React state (or an extra
 * animation frame) leaves the popup one frame behind the map while panning.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import s from './MapView.module.css'

/** Fallback width before the box is laid out; the real width comes from CSS. */
const BOX_W = 272
/** Diagonal then horizontal run of the leader, px */
const DIAG = 26
const RUN = 30
/** The line meets the box this far below its top edge (the header's midline) */
const JOIN = 12
const MARGIN = 6

export function LeaderPopup({
  map,
  at,
  label,
  children,
}: {
  map: MapLibreMap
  at: [number, number]
  label: string
  children: ReactNode
}) {
  const layer = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const pulse = useRef<SVGCircleElement>(null)
  const dot = useRef<SVGCircleElement>(null)
  const line = useRef<SVGPolylineElement>(null)
  const end = useRef<SVGCircleElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const els = [layer, svg, pulse, dot, line, end, box].map((r) => r.current)
    if (els.some((e) => !e)) return
    const place = () => {
      const p = map.project(at)
      const c = map.getContainer()
      const w = c.clientWidth
      const h = c.clientHeight
      const boxW = box.current!.offsetWidth || BOX_W
      const boxH = box.current!.offsetHeight || 140
      const { x, y } = p
      // Off-screen target (panned away or behind the globe): hide, keep state.
      const visible = x >= -8 && x <= w + 8 && y >= -8 && y <= h + 8
      layer.current!.toggleAttribute('data-hidden', !visible)
      if (!visible) return
      const dirX = x + DIAG + RUN + boxW + MARGIN <= w || x < w / 2 ? 1 : -1
      const dirY = y - DIAG - JOIN < MARGIN ? 1 : -1
      const p1x = x + dirX * DIAG
      const p1y = y + dirY * DIAG
      const p2x = p1x + dirX * RUN
      const left = Math.max(MARGIN, Math.min(w - boxW - MARGIN, dirX > 0 ? p2x : p2x - boxW))
      const top = Math.max(MARGIN, Math.min(h - boxH - MARGIN, p1y - JOIN))

      svg.current!.setAttribute('width', String(w))
      svg.current!.setAttribute('height', String(h))
      for (const c of [pulse.current!, dot.current!]) {
        c.setAttribute('cx', String(x))
        c.setAttribute('cy', String(y))
      }
      line.current!.setAttribute('points', `${x},${y} ${p1x},${p1y} ${p2x},${p1y}`)
      end.current!.setAttribute('cx', String(p2x))
      end.current!.setAttribute('cy', String(p1y))
      const b = box.current!
      b.style.left = `${left}px`
      b.style.top = `${top}px`
      b.dataset.dir = dirX > 0 ? 'right' : 'left'
    }
    place()
    map.on('move', place)
    map.on('resize', place)
    // Content height changes (data arriving) move the box's clamp.
    const ro = new ResizeObserver(place)
    ro.observe(box.current!)
    return () => {
      map.off('move', place)
      map.off('resize', place)
      ro.disconnect()
    }
  }, [map, at])

  return (
    <div ref={layer} className={s.popupLayer}>
      <svg ref={svg} className={s.leader} aria-hidden="true">
        <circle ref={pulse} className={s.leaderPulse} r={9} />
        <circle ref={dot} className={s.leaderDot} r={2.5} />
        <polyline ref={line} className={s.leaderLine} pathLength={1} />
        <circle ref={end} className={s.leaderEnd} r={2} />
      </svg>
      <div ref={box} className={s.popup} role="dialog" aria-label={label}>
        {children}
      </div>
    </div>
  )
}
