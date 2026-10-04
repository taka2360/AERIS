import { memo, useState } from 'react'
import { linkStatusOf } from '@/domain/health'
import { formatTime } from '@/domain/time'
import { useDataMode, useSystemControls, useSystemHealth } from '@/query/hooks'
import { Panel } from '../primitives/Panel'
import { KeyButton, StatusLamp } from '../primitives/primitives'
import s from './SystemPanel.module.css'

const SOURCES = [
  { name: '気象庁', detail: 'アメダス・府県予報・警報注意報・ナウキャスト' },
  {
    name: 'Open-Meteo',
    detail: '数値予報 (best match: JMA MSM/GSM 主体) · 地名検索(英字) · CC BY 4.0',
  },
  { name: '国土地理院', detail: '逆ジオコーディング・地名検索' },
  { name: 'OpenFreeMap / © OpenStreetMap', detail: '背景地図' },
]

export const SystemPanel = memo(function SystemPanel() {
  const { channels, overall, lastUpdate, online } = useSystemHealth()
  const mode = useDataMode()
  const { refresh, clearLocalData } = useSystemControls()
  const [cleared, setCleared] = useState(false)
  const [showSources, setShowSources] = useState(false)

  return (
    <Panel
      code="X-01"
      title="SYSTEM"
      meta={
        <span className={s.mode} data-mode={mode}>
          {mode === 'mock' ? 'SIMULATION DATA' : 'LIVE'}
        </span>
      }
      bodyClassName={s.body}
    >
      <div className={s.overall}>
        <span className={s.label}>DATA STATUS</span>
        <StatusLamp status={overall} />
        <span className={s.label}>LAST SUCCESSFUL UPDATE</span>
        <span className={s.value} data-testid="last-update">
          {lastUpdate ? `${formatTime(lastUpdate)} JST` : '--:--:--'}
        </span>
        {!online && <span className={s.offline}>■ BROWSER OFFLINE — SHOWING CACHED DATA</span>}
      </div>
      <table className={s.channels}>
        <caption className="visually-hidden">データソース別の状態</caption>
        <tbody>
          {channels.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.label}</th>
              <td>
                <StatusLamp status={linkStatusOf(c.health)} />
              </td>
              <td className={s.time}>
                {c.health.dataTime ? formatTime(c.health.dataTime, false) : '--:--'}
              </td>
              <td className={s.err}>{c.health.errorMessage ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={s.actions}>
        <KeyButton onClick={() => refresh()} hotkey="R">
          REFRESH
        </KeyButton>
        <KeyButton
          onClick={() => {
            clearLocalData()
            setCleared(true)
          }}
        >
          {cleared ? 'CACHE CLEARED' : 'CLEAR LOCAL DATA'}
        </KeyButton>
        <KeyButton onClick={() => setShowSources((v) => !v)} aria-expanded={showSources}>
          SOURCES
        </KeyButton>
      </div>
      {showSources && (
        <ul className={s.sources}>
          {SOURCES.map((src) => (
            <li key={src.name}>
              <b className="ja">{src.name}</b> <span className="ja">{src.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
})
