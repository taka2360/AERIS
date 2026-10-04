/** Display helpers shared by the event panels and the map. */
import type { EventCategory, NaturalEvent } from '@/domain/earth/events'
import { eventTime, measures } from '@/domain/earth/events'
import { intensityLabel } from '@/domain/earth/derive'
import { minutesBetween, type Instant } from '@/domain/time'

export const CATEGORY_TAG: Record<EventCategory, string> = {
  earthquake: 'EQ',
  tsunami: 'TSU',
  volcano: 'VOLC',
  'tropical-cyclone': 'TC',
  'severe-storm': 'STORM',
  wildfire: 'FIRE',
  landslide: 'SLIDE',
  flood: 'FLOOD',
  'space-weather': 'SPACE',
  'dust-haze': 'DUST',
  'sea-ice': 'ICE',
  'snow-ice': 'SNOW',
  other: 'OTHER',
}

export const CATEGORY_JA: Record<EventCategory, string> = {
  earthquake: '地震',
  tsunami: '津波',
  volcano: '火山',
  'tropical-cyclone': '熱帯低気圧',
  'severe-storm': '激しい嵐',
  wildfire: '山火事',
  landslide: '地すべり',
  flood: '洪水',
  'space-weather': '宇宙天気',
  'dust-haze': '砂塵・煙霧',
  'sea-ice': '海氷',
  'snow-ice': '雪氷',
  other: 'その他',
}

/** 'T−12M', 'T−3H', 'T−2D' (or '+' for future). */
export function ageLabel(now: Instant, t: Instant | undefined): string {
  if (!t) return 'T --'
  const m = minutesBetween(t, now)
  const sign = m >= 0 ? '−' : '+'
  const a = Math.abs(m)
  if (a < 60) return `T${sign}${Math.round(a)}M`
  if (a < 48 * 60) return `T${sign}${Math.round(a / 60)}H`
  return `T${sign}${Math.round(a / 1440)}D`
}

/** Short magnitude text: every source's value, e.g. 'Mj6.1 / Mw5.9'. */
export function magnitudeText(e: NaturalEvent): string | null {
  const ms = measures(e, 'earthquake.magnitude')
  if (ms.length === 0) return null
  return ms
    .map((m) => {
      const v = (m.variant ?? 'M').replace(/^mww$/i, 'Mw').replace(/^mb$/i, 'mb')
      return `${v}${m.value.toFixed(1)}`
    })
    .join(' / ')
}

/** Main figure of an event for compact lists. */
export function eventFigure(e: NaturalEvent): string {
  switch (e.category) {
    case 'earthquake': {
      const m = measures(e, 'earthquake.magnitude')
      const max = m.length ? Math.max(...m.map((x) => x.value)) : null
      const i = e.detail.maxIntensity ? ` 震度${intensityLabel(e.detail.maxIntensity)}` : ''
      return `${max != null ? `M${max.toFixed(1)}` : 'M--'}${i}`
    }
    case 'tropical-cyclone': {
      const p = measures(e, 'cyclone.central_pressure')[0]
      const w = measures(e, 'cyclone.max_wind')[0]
      return [p && `${p.value}hPa`, w && `${w.value}m/s`].filter(Boolean).join(' ')
    }
    case 'volcano':
      return e.detail.levelName ?? ''
    case 'space-weather':
      return e.detail.kind.toUpperCase()
    case 'tsunami':
      return e.lifecycle === 'ongoing' ? '発表中' : e.lifecycle === 'cancelled' ? '取消' : '解除'
    default:
      return ''
  }
}

export function sourceTags(e: NaturalEvent): string[] {
  const names: Record<string, string> = {
    'jma-quake': 'JMA',
    'usgs-quake': 'USGS',
    'jma-tsunami': 'JMA',
    'jma-typhoon': 'JMA',
    'jma-volcano': 'JMA',
    swpc: 'NOAA SWPC',
  }
  return [...new Set(e.sources.map((s) => names[s.source] ?? s.source.toUpperCase()))]
}

export { eventTime }
