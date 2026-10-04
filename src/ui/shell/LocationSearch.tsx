import { useEffect, useId, useRef, useState } from 'react'
import { usePlaceSearch } from '@/query/hooks'
import { useLocationControl } from '@/query/location'
import s from './LocationSearch.module.css'

/** Debounced value — avoids a request per keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

export function LocationSearch({ onClose }: { onClose: () => void }) {
  const { setManual } = useLocationControl()
  const [text, setText] = useState('')
  const [remember, setRemember] = useState(false)
  const [active, setActive] = useState(0)
  const query = useDebounced(text.trim(), 300)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => inputRef.current?.focus(), [])

  const results = usePlaceSearch(query)
  const items = results.data ?? []

  const choose = (i: number) => {
    const p = items[i]
    if (!p) return
    setManual({ lat: p.lat, lon: p.lon, label: p.name }, remember)
    onClose()
  }

  return (
    <div className={s.root} role="dialog" aria-label="地点検索">
      <div className={s.head}>
        <span className={s.prompt} aria-hidden="true">
          LOC&gt;
        </span>
        <input
          ref={inputRef}
          className={s.input}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(items.length - 1, a + 1))
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
            else if (e.key === 'Enter') choose(active)
            else if (e.key === 'Escape') onClose()
            else return
            e.preventDefault()
          }}
          placeholder="地名を入力 (例: 札幌)"
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-activedescendant={items.length ? `${listId}-${active}` : undefined}
          aria-label="地名"
        />
      </div>
      <ul id={listId} className={s.list} role="listbox">
        {results.isFetching && <li className={s.status}>◐ QUERYING GEOCODER…</li>}
        {results.isError && <li className={s.status}>■ GEOCODER UNAVAILABLE</li>}
        {!results.isFetching && query && items.length === 0 && !results.isError && (
          <li className={s.status}>NO MATCH</li>
        )}
        {items.map((p, i) => (
          <li
            key={`${p.lat},${p.lon}`}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={s.item}
            onPointerEnter={() => setActive(i)}
            onClick={() => choose(i)}
          >
            <span className="ja">{p.name}</span>
            <span className={`${s.admin} ja`}>{p.admin}</span>
            <span className={s.coord}>
              {p.lat.toFixed(2)}N {p.lon.toFixed(2)}E
            </span>
          </li>
        ))}
      </ul>
      <label className={s.remember}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        この地点を端末に記憶する(位置情報は保存されません)
      </label>
    </div>
  )
}
