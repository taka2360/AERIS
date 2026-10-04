/**
 * Time handling. All instants are ISO-8601 strings with an explicit offset.
 * Display is always fixed to Asia/Tokyo regardless of the browser time zone.
 */
export type Instant = string

export const JST_TZ = 'Asia/Tokyo'
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** Serialize a Date or epoch ms as an ISO string in JST (+09:00). */
export function toInstant(date: Date | number): Instant {
  const ms = typeof date === 'number' ? date : date.getTime()
  const j = new Date(ms + JST_OFFSET_MS)
  return (
    `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}` +
    `T${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}:${pad(j.getUTCSeconds())}+09:00`
  )
}

export function epoch(instant: Instant): number {
  return Date.parse(instant)
}

export function addMinutes(instant: Instant, minutes: number): Instant {
  return toInstant(epoch(instant) + minutes * 60_000)
}

export function minutesBetween(a: Instant, b: Instant): number {
  return (epoch(b) - epoch(a)) / 60_000
}

/** Calendar/clock parts of an instant as seen in JST. */
export function jstParts(instant: Instant) {
  const j = new Date(epoch(instant) + JST_OFFSET_MS)
  return {
    year: j.getUTCFullYear(),
    month: j.getUTCMonth() + 1,
    day: j.getUTCDate(),
    hour: j.getUTCHours(),
    minute: j.getUTCMinutes(),
    second: j.getUTCSeconds(),
    weekday: j.getUTCDay(),
  }
}

/** 'YYYY-MM-DD' calendar date in JST. */
export function jstDateKey(instant: Instant): string {
  const p = jstParts(instant)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** Midnight JST of a 'YYYY-MM-DD' date key. */
export function dateKeyToInstant(dateKey: string): Instant {
  return `${dateKey}T00:00:00+09:00`
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

export function formatTime(instant: Instant, withSeconds = true): string {
  const p = jstParts(instant)
  const hm = `${pad(p.hour)}:${pad(p.minute)}`
  return withSeconds ? `${hm}:${pad(p.second)}` : hm
}

export function formatHour(instant: Instant): string {
  return pad(jstParts(instant).hour)
}

export function formatDate(instant: Instant): string {
  const p = jstParts(instant)
  return `${p.year}.${pad(p.month)}.${pad(p.day)}`
}

export function formatShortDate(instant: Instant): string {
  const p = jstParts(instant)
  return `${pad(p.month)}/${pad(p.day)}`
}

export function formatWeekday(instant: Instant): string {
  return WEEKDAYS[jstParts(instant).weekday] ?? ''
}

/** Truncate to the start of the hour. */
export function startOfHour(instant: Instant): Instant {
  const ms = epoch(instant)
  return toInstant(ms - (ms % 3_600_000))
}
