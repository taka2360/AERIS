import type { Provenance } from '@/domain/model'
import { formatTime } from '@/domain/time'

/** Format a number with fixed digits; null renders as a dashed placeholder. */
export function fmt(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return digits > 0 ? '--.' + '-'.repeat(digits) : '--'
  return value.toFixed(digits)
}

export function signed(value: number, digits = 1): string {
  const s = value.toFixed(digits)
  return value > 0 ? `+${s}` : s
}

export type ProvKind = 'OBS' | 'MDL' | 'FCST' | 'JMA'

export function provKind(p: Provenance): ProvKind {
  switch (p.kind) {
    case 'observation':
      return 'OBS'
    case 'model':
      return 'MDL'
    case 'forecast':
      return 'FCST'
    case 'official':
      return 'JMA'
  }
}

/** Long human description of a provenance, for tooltips and screen readers. */
export function provDescription(p: Provenance): string {
  const kind = {
    observation: '実測',
    model: '数値モデル',
    forecast: '予報',
    official: '公式発表',
  }[p.kind]
  const parts = [kind, p.label]
  if (p.distanceKm != null) parts.push(`${p.distanceKm.toFixed(1)}km`)
  const t = p.observedAt ?? p.issuedAt
  if (t) parts.push(`${formatTime(t, false)} JST`)
  return parts.filter(Boolean).join(' · ')
}
