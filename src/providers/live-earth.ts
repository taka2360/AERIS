/**
 * Live Earth-observation sources, split by domain behind the EarthProvider facade.
 */
import type { EarthProvider, SeismicProvider } from '@/services/earth/provider'
import { roundPoint } from '@/services/provider'
import { fetchJmaQuakeDetail, fetchJmaQuakes } from '@/sources/jma-quake'
import { fetchTsunamiAreas, fetchTsunamiReports } from '@/sources/jma-tsunami'
import { fetchCyclones } from '@/sources/jma-typhoon'
import { fetchVolcanoes } from '@/sources/jma-volcano'
import { fetchRiverDischarge } from '@/sources/openmeteo-flood'
import { fetchAirQuality } from '@/sources/openmeteo-air'
import { fetchMarine, fetchMarineGrid } from '@/sources/openmeteo-marine'
import { fetchAurora, fetchSpaceWeather } from '@/sources/swpc'
import { fetchEonet } from '@/sources/eonet'
import { fetchGdacs } from '@/sources/gdacs'
import { fetchFirms, fetchNhc } from '@/sources/relay'
import { fetchInformation } from '@/sources/jma-information'
import {
  fetchKikikuru,
  fetchSnow,
  fetchLightningStrokes,
  fetchThunderSeries,
  type TileFieldKind,
} from '@/sources/jma-tile'
import { sampleFlood } from '@/sources/jma-tile/flood'
import { sampleFrame } from '@/sources/jma-tile/image'
import { PALETTES } from '@/sources/jma-tile/palettes'
import { fetchUsgsQuakes } from '@/sources/usgs-quake'

function liveSeismic(): SeismicProvider {
  return {
    jma: (signal) => fetchJmaQuakes(signal),
    usgs: (signal) => fetchUsgsQuakes('4.5_week', signal),
    jmaDetail: (obs, signal) => fetchJmaQuakeDetail(obs, signal),
  }
}

export function createLiveEarthProvider(): EarthProvider {
  return {
    seismic: liveSeismic(),
    tsunami: {
      reports: (signal) => fetchTsunamiReports(signal),
      areas: (signal) => fetchTsunamiAreas(signal),
    },
    volcano: { volcanoes: (signal) => fetchVolcanoes(signal) },
    global: {
      eonet: (signal) => fetchEonet(signal),
      gdacs: (signal) => fetchGdacs(signal),
      firms: (signal) => fetchFirms([-180, -90, 180, 90], signal),
      nhc: (signal) => fetchNhc(signal),
    },
    space: {
      weather: (signal) => fetchSpaceWeather(signal),
      aurora: (signal) => fetchAurora(signal),
    },
    environment: {
      air: (p, signal) => fetchAirQuality(roundPoint(p), signal),
      marine: (p, signal) => fetchMarine(roundPoint(p), signal),
      snow: (signal) => fetchSnow(signal),
      marineGrid: (signal) => fetchMarineGrid(signal),
    },
    hydrology: {
      kikikuru: (signal) => fetchKikikuru(signal),
      river: (p, signal) => fetchRiverDischarge(roundPoint(p), signal),
    },
    atmosphere: {
      cyclones: (signal) => fetchCyclones(signal),
      information: (signal) => fetchInformation(signal),
      thunder: (signal) => fetchThunderSeries(signal),
      strokes: (signal) => fetchLightningStrokes(signal),
      async sample(kind, frame, series, point, radiusKm, signal) {
        // z8: ~0.6 km per pixel at Japan's latitudes.
        const radiusPx = Math.max(0, Math.round(radiusKm / 0.5))
        try {
          if (kind === 'kikikuru-flood') {
            const f = await sampleFlood(
              frame,
              point.lat,
              point.lon,
              radiusKm,
              series.provenance,
              signal,
            )
            return { ok: true, data: f, provenance: f.provenance }
          }
          const s = await sampleFrame(
            frame,
            PALETTES[kind as TileFieldKind],
            point.lat,
            point.lon,
            series.provenance,
            { zoom: 8, radiusPx, signal },
          )
          return { ok: true, data: s, provenance: s.provenance }
        } catch (e) {
          return {
            ok: false,
            source: series.provenance.source,
            error: {
              kind: signal?.aborted ? 'aborted' : 'network',
              message: e instanceof Error ? e.message : 'tile sample failed',
              retryable: true,
            },
          }
        }
      },
    },
  }
}
