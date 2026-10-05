/**
 * A popup tied to a map position by an elbow leader line. The line draws out
 * from the target, then the box unfolds from where the line meets it. The
 * target is re-projected on every map move, so the popup follows pans/zooms.
 * The box goes to whichever side has room (right and up preferred).
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import s from './MapView.module.css'

const BOX_W = 272
/** Diagonal then horizontal run of the leader, px */
const DIAG = 26
const RUN = 30
/** The line meets the box this far below its top edge (the header's midline) */
const JOIN = 12
const MARGIN = 6

type View = { x: number; y: number; w: number; h: number }

function project(map: MapLibreMap, at: [number, number]): View {
  const p = map.project(at)
  const c = map.getContainer()
  return { x: p.x, y: p.y, w: c.clientWidth, h: c.clientHeight }
}

export function LeaderPopup({
  map,
  at,
  children,
}: {
  map: MapLibreMap
  at: [number, number]
  children: ReactNode
}) {
  const [view, setView] = useState<View>(() => project(map, at))
  const boxRef = useRef<HTMLDivElement>(null)
  const [boxH, setBoxH] = useState(140)

  useLayoutEffect(() => {
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setView(project(map, at)))
    }
    update()
    map.on('move', update)
    map.on('resize', update)
    return () => {
      cancelAnimationFrame(raf)
      map.off('move', update)
      map.off('resize', update)
    }
  }, [map, at])

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { x, y, w, h } = view
  // Off-screen target (panned away or behind the globe): hide, keep state.
  const visible = x >= -8 && x <= w + 8 && y >= -8 && y <= h + 8
  const dirX = x + DIAG + RUN + BOX_W + MARGIN <= w || x < w / 2 ? 1 : -1
  const dirY = y - DIAG - JOIN < MARGIN ? 1 : -1
  const p1 = { x: x + dirX * DIAG, y: y + dirY * DIAG }
  const p2 = { x: p1.x + dirX * RUN, y: p1.y }
  const left = Math.max(MARGIN, Math.min(w - BOX_W - MARGIN, dirX > 0 ? p2.x : p2.x - BOX_W))
  const top = Math.max(MARGIN, Math.min(h - boxH - MARGIN, p2.y - JOIN))

  return (
    <div className={s.popupLayer} data-hidden={!visible || undefined}>
      <svg className={s.leader} width={w} height={h} aria-hidden="true">
        <circle className={s.leaderPulse} cx={x} cy={y} r={9} />
        <circle className={s.leaderDot} cx={x} cy={y} r={2.5} />
        <polyline
          className={s.leaderLine}
          points={`${x},${y} ${p1.x},${p1.y} ${p2.x},${p2.y}`}
          pathLength={1}
        />
        <circle className={s.leaderEnd} cx={p2.x} cy={p2.y} r={2} />
      </svg>
      <div
        ref={boxRef}
        className={s.popup}
        data-dir={dirX > 0 ? 'right' : 'left'}
        style={{ left, top, width: BOX_W }}
        role="dialog"
        aria-label="選択したイベント"
      >
        {children}
      </div>
    </div>
  )
}
