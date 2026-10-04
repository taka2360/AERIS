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

export type QualityTag = {
  tag: string
  tone: 'obs' | 'fcst' | 'model' | 'caution' | 'faint'
  desc: string
}

/**
 * Badges for the Earth-observation axes, combined rather than merged:
 * time role (OBS / NOW / ANL / FCST), production (MODEL / EST / DRV),
 * finality (PRELIM) and interpretability (NOT DECODED / PARTIAL).
 */
export function qualityTags(p: Provenance): QualityTag[] {
  const tags: QualityTag[] = []
  const role = p.role
  if (role === 'observed') tags.push({ tag: 'OBS', tone: 'obs', desc: '観測値' })
  else if (role === 'nowcast')
    tags.push({ tag: 'NOW', tone: 'fcst', desc: '短時間予測(ナウキャスト)' })
  else if (role === 'analysis') tags.push({ tag: 'ANL', tone: 'fcst', desc: '解析値' })
  else if (role === 'forecast') tags.push({ tag: 'FCST', tone: 'fcst', desc: '予測値' })
  if (p.derivation === 'modeled')
    tags.push({ tag: 'MODEL', tone: 'model', desc: '数値モデルによる値' })
  else if (p.derivation === 'estimated') tags.push({ tag: 'EST', tone: 'caution', desc: '推定値' })
  else if (p.derivation === 'derived')
    tags.push({ tag: 'DRV', tone: 'faint', desc: '他の値から算出した値' })
  if (p.quality === 'preliminary')
    tags.push({ tag: 'PRELIM', tone: 'caution', desc: '速報値(後で修正されうる)' })
  if (p.decode === 'not-decoded')
    tags.push({ tag: 'NOT DECODED', tone: 'caution', desc: 'データを解釈できなかった' })
  else if (p.decode === 'partial')
    tags.push({ tag: 'PARTIAL', tone: 'caution', desc: '一部のみ解釈できた' })
  return tags
}
