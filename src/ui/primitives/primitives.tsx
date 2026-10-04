import { useEffect, useRef, type ReactNode } from 'react'
import type { LinkStatus } from '@/domain/health'
import type { Provenance } from '@/domain/model'
import { provDescription, provKind, qualityTags } from '../format'
import s from './primitives.module.css'

/** Small badge telling where a value came from: OBS / MDL / FCST / JMA. */
export function ProvTag({ provenance }: { provenance?: Provenance }) {
  if (!provenance)
    return (
      <span className={s.prov} data-kind="NONE" aria-label="データなし">
        ----
      </span>
    )
  const kind = provKind(provenance)
  const desc = provDescription(provenance)
  return (
    <span className={s.prov} data-kind={kind} title={desc} aria-label={desc}>
      {kind}
    </span>
  )
}

/** Earth-observation badges: OBS / FCST / MODEL / EST / PRELIM / NOT DECODED … */
export function QualityTags({ provenance }: { provenance?: Provenance }) {
  if (!provenance) return null
  return (
    <span className={s.qtags}>
      {qualityTags(provenance).map((q) => (
        <span key={q.tag} className={s.qtag} data-tone={q.tone} title={q.desc}>
          {q.tag}
        </span>
      ))}
    </span>
  )
}

/** Data state that overrides the value's own meaning: never show stale data as current. */
export type DataState =
  | 'unavailable'
  | 'connection-lost'
  | 'delayed'
  | 'stale'
  | 'partial'
  | 'not-configured'
  | 'not-available'

const DATA_STATE_TEXT: Record<DataState, string> = {
  unavailable: 'DATA UNAVAILABLE',
  'connection-lost': 'CONNECTION LOST',
  delayed: 'DELAYED',
  stale: 'STALE',
  partial: 'PARTIAL',
  'not-configured': 'NOT CONFIGURED',
  'not-available': 'NOT AVAILABLE',
}

export function DataStateBadge({ state }: { state: DataState }) {
  return (
    <span className={s.dstate} data-state={state}>
      {DATA_STATE_TEXT[state]}
    </span>
  )
}

const LAMP: Record<LinkStatus, { glyph: string; text: string }> = {
  online: { glyph: '●', text: 'ONLINE' },
  syncing: { glyph: '◐', text: 'SYNCING' },
  degraded: { glyph: '▲', text: 'DEGRADED' },
  stale: { glyph: '◆', text: 'STALE' },
  offline: { glyph: '■', text: 'OFFLINE' },
  standby: { glyph: '○', text: 'STANDBY' },
}

/** Status indicator — colour + glyph + word, never colour alone. */
export function StatusLamp({ status, label }: { status: LinkStatus; label?: string }) {
  const l = LAMP[status]
  return (
    <span className={s.lamp} data-status={status}>
      <span className={s.lampGlyph} aria-hidden="true">
        {l.glyph}
      </span>
      {label ?? l.text}
    </span>
  )
}

/** Re-triggers a short highlight whenever `value` changes (not on first render). */
export function Flash({
  value,
  children,
  className,
}: {
  value: unknown
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(value)
  useEffect(() => {
    if (prev.current === value) return
    prev.current = value
    const el = ref.current
    if (!el) return
    el.classList.remove('flash')
    void el.offsetWidth // restart animation
    el.classList.add('flash')
  }, [value])
  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  )
}

/** Label/value/unit row with provenance. */
export function DataRow({
  label,
  value,
  unit,
  provenance,
  extra,
  emphasis,
}: {
  label: string
  value: string
  unit?: string
  provenance?: Provenance
  extra?: ReactNode
  emphasis?: boolean
}) {
  return (
    <div className={s.row} data-emphasis={emphasis || undefined}>
      <dt className={s.rowLabel}>{label}</dt>
      <dd className={s.rowValue}>
        <Flash value={value} className={s.rowNum}>
          {value}
        </Flash>
        {unit && <span className={s.rowUnit}>{unit}</span>}
      </dd>
      <dd className={s.rowExtra}>{extra}</dd>
      <dd className={s.rowProv}>
        <ProvTag provenance={provenance} />
      </dd>
    </div>
  )
}

/** Thin segmented bar gauge. `value` in [0, 1]. */
export function SegmentBar({
  value,
  segments = 20,
  tone = 'amber',
  label,
}: {
  value: number
  segments?: number
  tone?: 'amber' | 'cyan' | 'green' | 'yellow' | 'red'
  label?: string
}) {
  const lit = Math.round(Math.max(0, Math.min(1, value)) * segments)
  return (
    <span className={s.bar} data-tone={tone} role="img" aria-label={label}>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={s.seg} data-lit={i < lit || undefined} />
      ))}
    </span>
  )
}

/** Inline button styled as a terminal key. */
export function KeyButton({
  children,
  hotkey,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { hotkey?: string }) {
  return (
    <button type="button" className={s.key} {...rest}>
      {children}
      {hotkey && (
        <kbd className={s.kbd} aria-hidden="true">
          {hotkey}
        </kbd>
      )}
    </button>
  )
}
