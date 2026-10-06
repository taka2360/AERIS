/**
 * Moon ephemeris, computed locally (no data source): position, illuminated
 * fraction and phase, rise/set times and the next principal phases.
 * Low-precision formulas after Meeus / "SunCalc" (V. Agafonkin): a few
 * minutes of error in rise/set, enough for a display.
 */
import { dateKeyToInstant, epoch, jstDateKey, toInstant, type Instant } from './time'

const RAD = Math.PI / 180
const DAY_MS = 86_400_000
const J1970 = 2_440_588
const J2000 = 2_451_545
const OBLIQUITY = RAD * 23.4397
/** Mean synodic month, days */
export const SYNODIC_MONTH = 29.530588853

const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000

const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l))
const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l))
const altitudeOf = (h: number, phi: number, dec: number) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h))
const azimuthOf = (h: number, phi: number, dec: number) =>
  Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi))
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw

function refraction(h: number): number {
  const a = Math.max(0, h)
  return 0.0002967 / Math.tan(a + 0.00312536 / (a + 0.08901179))
}

function sunCoords(d: number) {
  const m = RAD * (357.5291 + 0.98560028 * d)
  const c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m))
  const l = m + c + RAD * 102.9372 + Math.PI
  return { lon: l, dec: declination(l, 0), ra: rightAscension(l, 0) }
}

/** Geocentric Moon with the largest periodic terms (equation of centre, evection, variation …). */
function moonCoords(d: number) {
  const l0 = RAD * (218.316 + 13.176396 * d)
  const mm = RAD * (134.963 + 13.064993 * d) // Moon's mean anomaly
  const ms = RAD * (357.5291 + 0.98560028 * d) // Sun's mean anomaly
  const dd = RAD * (297.8502 + 12.19074912 * d) // mean elongation
  const f = RAD * (93.272 + 13.22935 * d) // argument of latitude
  const l =
    l0 +
    RAD *
      (6.289 * Math.sin(mm) +
        1.274 * Math.sin(2 * dd - mm) +
        0.658 * Math.sin(2 * dd) +
        0.214 * Math.sin(2 * mm) -
        0.186 * Math.sin(ms) -
        0.114 * Math.sin(2 * f))
  const b =
    RAD *
    (5.128 * Math.sin(f) +
      0.281 * Math.sin(mm + f) +
      0.278 * Math.sin(mm - f) +
      0.173 * Math.sin(2 * dd - f))
  const distKm =
    385_001 - 20_905 * Math.cos(mm) - 3_699 * Math.cos(2 * dd - mm) - 2_956 * Math.cos(2 * dd)
  return { lon: l, ra: rightAscension(l, b), dec: declination(l, b), distKm }
}

/** Altitude / azimuth in degrees (azimuth from north, clockwise) and distance in km. */
export function moonPosition(at: Instant, lat: number, lon: number) {
  const d = toDays(epoch(at))
  const c = moonCoords(d)
  const phi = RAD * lat
  const h = siderealTime(d, RAD * -lon) - c.ra
  const alt = altitudeOf(h, phi, c.dec)
  return {
    altitude: (alt + refraction(alt)) / RAD,
    azimuth: (((azimuthOf(h, phi, c.dec) / RAD + 180) % 360) + 360) % 360,
    distanceKm: c.distKm,
  }
}

export type MoonIllumination = {
  /** Illuminated fraction of the disc, 0–1 */
  fraction: number
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter */
  phase: number
  /** Days since new moon (phase × synodic month) */
  age: number
  waxing: boolean
}

export function moonIllumination(at: Instant): MoonIllumination {
  const d = toDays(epoch(at))
  const s = sunCoords(d)
  const m = moonCoords(d)
  const sunDistKm = 149_598_000
  const phi = Math.acos(
    Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra),
  )
  const inc = Math.atan2(sunDistKm * Math.sin(phi), m.distKm - sunDistKm * Math.cos(phi))
  // Phase from the difference in ecliptic longitude, as new / full moon are defined.
  const phase = ((((m.lon - s.lon) / (2 * Math.PI)) % 1) + 1) % 1
  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase,
    age: phase * SYNODIC_MONTH,
    waxing: phase < 0.5,
  }
}

/** Japanese and short English names of the phase. */
export function moonPhaseName(phase: number): { ja: string; code: string } {
  const p = ((phase % 1) + 1) % 1
  if (p < 0.034 || p >= 0.966) return { ja: '新月', code: 'NEW' }
  if (p < 0.216) return { ja: '三日月', code: 'WAX CRES' }
  if (p < 0.284) return { ja: '上弦', code: 'FIRST QTR' }
  if (p < 0.466) return { ja: '十三夜', code: 'WAX GIBB' }
  if (p < 0.534) return { ja: '満月', code: 'FULL' }
  if (p < 0.716) return { ja: '寝待月', code: 'WAN GIBB' }
  if (p < 0.784) return { ja: '下弦', code: 'LAST QTR' }
  return { ja: '有明月', code: 'WAN CRES' }
}

/**
 * Moonrise / moonset during the JST calendar day of `day`. Either may be
 * missing (the Moon rises about 50 minutes later each day, so one day a
 * month has no rise or no set).
 */
export function moonTimes(
  day: Instant,
  lat: number,
  lon: number,
): { rise: Instant | null; set: Instant | null } {
  const t0 = epoch(dateKeyToInstant(jstDateKey(day)))
  const hc = 0.133 * RAD
  const alt = (hours: number) =>
    moonPosition(toInstant(t0 + hours * 3_600_000), lat, lon).altitude * RAD - hc
  let rise: number | null = null
  let set: number | null = null
  let h0 = alt(0)
  // Fit a parabola through each 2-hour window and solve for its roots.
  for (let i = 1; i <= 24; i += 2) {
    const h1 = alt(i)
    const h2 = alt(i + 1)
    const a = (h0 + h2) / 2 - h1
    const b = (h2 - h0) / 2
    const xe = -b / (2 * a)
    const ye = (a * xe + b) * xe + h1
    const disc = b * b - 4 * a * h1
    let roots = 0
    let x1 = 0
    let x2 = 0
    if (disc >= 0) {
      const dx = Math.sqrt(disc) / (Math.abs(a) * 2)
      x1 = xe - dx
      x2 = xe + dx
      if (Math.abs(x1) <= 1) roots++
      if (Math.abs(x2) <= 1) roots++
      if (x1 < -1) x1 = x2
    }
    if (roots === 1) {
      if (h0 < 0) rise = i + x1
      else set = i + x1
    } else if (roots === 2) {
      rise = i + (ye < 0 ? x2 : x1)
      set = i + (ye < 0 ? x1 : x2)
    }
    if (rise != null && set != null) break
    h0 = h2
  }
  const at = (h: number | null) => (h == null ? null : toInstant(t0 + h * 3_600_000))
  return { rise: at(rise), set: at(set) }
}

/**
 * Next time the phase reaches `target` (0 = new, 0.5 = full) after `from`,
 * found by stepping 6 hours and bisecting to the minute.
 */
export function nextPhase(from: Instant, target: 0 | 0.25 | 0.5 | 0.75): Instant {
  // Phase distance still to go, in [0, 1): decreases until the target is passed.
  const togo = (ms: number) => (((target - moonIllumination(toInstant(ms)).phase) % 1) + 1) % 1
  const start = epoch(from)
  let a = start
  let prev = togo(a)
  for (let ms = start + 6 * 3_600_000; ms <= start + 32 * DAY_MS; ms += 6 * 3_600_000) {
    const cur = togo(ms)
    if (cur > prev) {
      // Wrapped past the target between a and ms.
      let lo = a
      let hi = ms
      while (hi - lo > 60_000) {
        const mid = (lo + hi) / 2
        if (togo(mid) > togo(lo)) hi = mid
        else lo = mid
      }
      return toInstant(Math.round(hi / 60_000) * 60_000)
    }
    a = ms
    prev = cur
  }
  return toInstant(start + SYNODIC_MONTH * DAY_MS)
}
