import { memo } from 'react'
import { AERIS_RULES, type AerisReasonCode } from '@/domain/derive'
import { useAerisStatus } from '@/query/hooks'
import { Panel } from '../primitives/Panel'
import s from './AerisStatus.module.css'

const REASON_TEXT: Record<AerisReasonCode, { code: string; ja: string }> = {
  HIGH_GUST: { code: 'GUST', ja: '強い突風' },
  HIGH_WIND: { code: 'WIND', ja: '強風' },
  HEAVY_PRECIP: { code: 'PRECIP', ja: '強い降水(現在)' },
  PRECIP_INBOUND: { code: 'PRECIP+3H', ja: '3時間以内に強い降水' },
  LOW_VISIBILITY: { code: 'VIS', ja: '視程低下' },
  HEAT: { code: 'HEAT', ja: '高温' },
  COLD: { code: 'COLD', ja: '低温' },
  PRESSURE_DROP: { code: 'PRES-3H', ja: '気圧急降下' },
  HIGH_UV: { code: 'UV', ja: '強い紫外線' },
}

const LEVEL = {
  nominal: { glyph: '●', word: 'NOMINAL' },
  caution: { glyph: '▲', word: 'CAUTION' },
  alert: { glyph: '■', word: 'ALERT' },
} as const

export const AerisStatus = memo(function AerisStatus() {
  const status = useAerisStatus()
  const l = LEVEL[status.level]
  return (
    <Panel
      code="S-01"
      title="AERIS STATUS"
      meta={
        status.inputComplete ? (
          <span>INTERNAL ASSESSMENT</span>
        ) : (
          <span className={s.limited}>▲ LIMITED INPUT</span>
        )
      }
      tone={status.level === 'alert' ? 'alert' : status.level === 'caution' ? 'caution' : 'default'}
    >
      <div className={s.level} data-level={status.level} role="status">
        <span className={s.glyph} aria-hidden="true">
          {l.glyph}
        </span>
        <span className={s.word}>{l.word}</span>
        <span className={s.count}>{String(status.reasons.length).padStart(2, '0')} FLAGS</span>
      </div>
      {status.reasons.length > 0 ? (
        <ul className={s.reasons}>
          {status.reasons.map((r) => (
            <li key={r.code} data-level={r.level}>
              <span className={s.rGlyph} aria-hidden="true">
                {r.level === 'alert' ? '■' : '▲'}
              </span>
              <span className={s.rCode}>{REASON_TEXT[r.code].code}</span>
              <span className={`${s.rJa} ja`}>{REASON_TEXT[r.code].ja}</span>
              <span className={s.rVal}>
                {r.value.toFixed(1)}
                {r.unit && <small> {r.unit}</small>}
                <small className={s.rThr}>
                  {' '}
                  {AERIS_RULES[r.code].dir === 'below' ? '≤' : '≥'}
                  {r.threshold}
                </small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.nominal}>全監視項目が閾値内</p>
      )}
      <p className={`${s.note} ja`}>※ AERIS独自の判定です。気象庁の警報・注意報ではありません。</p>
    </Panel>
  )
})
