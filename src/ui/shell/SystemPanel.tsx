import { memo, useState } from 'react'
import { linkStatusOf } from '@/domain/health'
import { formatTime } from '@/domain/time'
import {
  useDataMode,
  useSourceContracts,
  useSystemControls,
  useSystemHealth,
  type Channel,
} from '@/query/hooks'
import { Panel } from '../primitives/Panel'
import { KeyButton, StatusLamp } from '../primitives/primitives'
import s from './SystemPanel.module.css'

const DOMAIN_LABEL: Record<Channel['domain'], string> = {
  weather: 'WEATHER',
  seismic: 'SEISMIC',
  tsunami: 'TSUNAMI',
  volcano: 'VOLCANO',
  atmosphere: 'ATMOSPHERE',
  hydro: 'HYDRO',
  ocean: 'OCEAN',
  environment: 'ENVIRONMENT',
  space: 'SPACE WX',
  global: 'GLOBAL',
  map: 'MAP',
  geocode: 'GEOCODE',
  internal: 'INTERNAL',
}

/** Channels grouped by observation domain, in first-seen order. */
function groupByDomain(channels: Channel[]): Array<[Channel['domain'], Channel[]]> {
  const groups = new Map<Channel['domain'], Channel[]>()
  for (const c of channels) groups.set(c.domain, [...(groups.get(c.domain) ?? []), c])
  return [...groups]
}

export const SystemPanel = memo(function SystemPanel() {
  const { channels, overall, lastUpdate, online } = useSystemHealth()
  const mode = useDataMode()
  const { refresh, clearLocalData } = useSystemControls()
  const contracts = useSourceContracts().filter((c) => c.status === 'active')
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
      <div className={s.channelGrid} role="group" aria-label="データソース別の状態">
        {groupByDomain(channels).map(([domain, list]) => (
          <table key={domain} className={s.channels}>
            <caption className={s.group}>{DOMAIN_LABEL[domain]}</caption>
            <tbody>
              {list.map((c) => (
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
        ))}
      </div>
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
          {contracts.map((src) => (
            <li key={src.id}>
              <b className="ja">
                {src.attribution.url ? (
                  <a href={src.attribution.url} target="_blank" rel="noreferrer">
                    {src.attribution.text}
                  </a>
                ) : (
                  src.attribution.text
                )}
              </b>{' '}
              <span className="ja">
                {src.label} · {src.license}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
})
