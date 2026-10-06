/**
 * Live provider: real sources behind the WeatherProvider contract.
 * All requests go straight from the browser to the public APIs (CORS-enabled);
 * coordinates are rounded to 0.01° before leaving the device.
 */
import type { WeatherLocation } from '@/domain/model'
import type { SourceError, SourceResult } from '@/domain/result'
import { toInstant } from '@/domain/time'
import type { WeatherProvider } from '@/services/provider'
import { roundPoint } from '@/services/provider'
import { prefectureOf, reverseGeocode, searchAddress } from '@/sources/gsi'
import { fetchStations } from '@/sources/jma-amedas'
import { lookupArea } from '@/sources/jma-area'
import { fetchOfficialForecast } from '@/sources/jma-forecast'
import { fetchNowcastFrames } from '@/sources/jma-nowcast'
import { fetchWarnings } from '@/sources/jma-warning'
import { fetchClimateNormals } from '@/sources/openmeteo-archive'
import { fetchExtendedDaily, fetchForecast, fetchWindAt } from '@/sources/openmeteo-forecast'
import { searchPlacesOpenMeteo } from '@/sources/openmeteo-geocoder'
import { createLiveEarthProvider } from './live-earth'

const NO_AREA: SourceError = {
  kind: 'invalid_response',
  message: 'location has no JMA area',
  retryable: false,
}

export function createLiveProvider(): WeatherProvider {
  const now = () => toInstant(Date.now())

  return {
    id: 'live',
    now,
    earth: createLiveEarthProvider(),
    forecast: (p, signal) => fetchForecast(roundPoint(p), signal),
    extendedDaily: (p, signal) => fetchExtendedDaily(roundPoint(p), signal),
    climateNormals: (p, anchor, signal) => fetchClimateNormals(roundPoint(p), anchor, signal),
    stations: (p, signal) => fetchStations(roundPoint(p), signal),
    windAt: (pts, signal) => fetchWindAt(pts, signal),
    nowcastFrames: (signal) => fetchNowcastFrames(signal),

    alerts: async (loc, signal) => {
      if (!loc.jma) return { ok: false, source: 'jma-warning', error: NO_AREA }
      return fetchWarnings(loc.jma.office, loc.jma.class20, loc.name, signal)
    },

    officialForecast: async (loc, signal) => {
      if (!loc.jma) return { ok: false, source: 'jma-forecast', error: NO_AREA }
      return fetchOfficialForecast(loc.jma.office, loc.jma.class10, signal)
    },

    async resolveLocation(p, signal): Promise<SourceResult<WeatherLocation>> {
      const point = roundPoint(p)
      const retrievedAt = now()
      const geo = await reverseGeocode(point.lat, point.lon, signal)
      if (!geo.ok) return { ok: false, source: 'gsi-geocoder', error: geo.error }
      const base: WeatherLocation = {
        lat: p.lat,
        lon: p.lon,
        name: '海上 / 不明地点',
        origin: p.origin,
      }
      if (!geo.data) {
        return {
          ok: true,
          data: base,
          provenance: { source: 'gsi-geocoder', kind: 'official', retrievedAt },
        }
      }
      const { muniCode, localName } = geo.data
      const area = await lookupArea(muniCode, signal)
      if (!area.ok) return { ok: false, source: 'jma-area', error: area.error }
      const a = area.data
      const data: WeatherLocation = {
        ...base,
        name: a ? `${prefectureOf(muniCode)}${a.class20Name}` : prefectureOf(muniCode) || base.name,
        subName: localName || undefined,
        muniCode,
        jma: a
          ? { office: a.office, class10: a.class10, class20: a.class20, officeName: a.officeName }
          : undefined,
      }
      return {
        ok: true,
        data,
        provenance: { source: 'gsi-geocoder', kind: 'official', label: '国土地理院', retrievedAt },
      }
    },

    async searchPlaces(query, signal) {
      const q = query.trim()
      // Japanese script → GSI address search; latin → Open-Meteo geocoder.
      const latin = /^[\x20-\x7e]+$/.test(q)
      const r = latin ? await searchPlacesOpenMeteo(q, signal) : await searchAddress(q, signal)
      const source = latin ? 'openmeteo-geocoder' : 'gsi-search'
      if (!r.ok) return { ok: false, source, error: r.error }
      return {
        ok: true,
        data: r.data,
        provenance: { source, kind: 'official', retrievedAt: now() },
      }
    },
  }
}
