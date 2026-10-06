/**
 * Popup for a click on an empty spot of the map: where it is, how far from
 * the monitoring location, and a button that moves the monitoring there.
 * The new location is held in memory only (like a GPS fix), never saved.
 */
import { haversineKm, formatCoord } from '@/domain/derive'
import { useResolvedLocation } from '@/query/hooks'
import { useLocationControl } from '@/query/location'
import s from '../panels/EventPopup.module.css'

export function PointPopup({ at, onClose }: { at: [number, number]; onClose: () => void }) {
  const { location } = useResolvedLocation()
  const { setManual } = useLocationControl()
  // The click may land on a repeated world copy: bring longitude into ±180.
  const lon = ((((at[0] + 180) % 360) + 360) % 360) - 180
  const lat = at[1]
  const km = haversineKm(location.lat, location.lon, lat, lon)

  const moveHere = () => {
    setManual({ lat, lon }, false)
    onClose()
  }

  return (
    <>
      <div className={s.head}>
        <span className={s.tag}>PT</span>
        <span className={s.title}>SELECTED POINT</span>
        <button type="button" className={s.close} onClick={onClose} aria-label="閉じる">
          ✕
        </button>
      </div>
      <div className={s.body}>
        <div className={s.coord}>{formatCoord(lat, lon)}</div>
        <dl className={s.rows}>
          <dt>DIST</dt>
          <dd>
            {km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()} km ·{' '}
            <span className="ja">現在の監視地点({location.name})から</span>
          </dd>
        </dl>
      </div>
      <button type="button" className={s.action} onClick={moveHere}>
        <span className="ja">◎ ここを監視地点にする</span>
        <span>SET ▸</span>
      </button>
    </>
  )
}
