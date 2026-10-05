/**
 * Grouped layer switcher for the spatial scope. Raster fields are exclusive
 * (one colour scale at a time); point and line layers combine freely.
 */
import { useEffect, useRef } from 'react'
import { LAYER_CATALOG, toggleLayer } from './layers/catalog'
import type { LayerVisibility } from './layers/types'
import s from './SpatialScope.module.css'

const GROUPS = [...new Set(LAYER_CATALOG.map((e) => e.group))]

export function LayerMenu({
  layers,
  setLayers,
  open,
  setOpen,
}: {
  layers: LayerVisibility
  setLayers: (v: LayerVisibility) => void
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open, setOpen])

  if (!open) return null
  return (
    <div ref={ref} className={s.layerMenu} role="group" aria-label="表示レイヤー">
      {GROUPS.map((g) => (
        <fieldset key={g} className={s.layerGroup}>
          <legend>{g}</legend>
          {LAYER_CATALOG.filter((e) => e.group === g).map((e) => (
            <label key={e.id} className={s.layerItem}>
              <input
                type="checkbox"
                checked={layers[e.id]}
                onChange={() => setLayers(toggleLayer(layers, e.id))}
              />
              <span className={s.layerName}>{e.label}</span>
              {e.raster && <span className={s.layerKind}>FIELD</span>}
              <span className={`${s.layerDesc} ja`}>{e.desc}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  )
}
