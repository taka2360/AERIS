/**
 * Live Earth-observation sources, split by domain behind the EarthProvider facade.
 */
import type { EarthProvider, SeismicProvider } from '@/services/earth/provider'
import { fetchJmaQuakeDetail, fetchJmaQuakes } from '@/sources/jma-quake'
import { fetchTsunamiAreas, fetchTsunamiReports } from '@/sources/jma-tsunami'
import { fetchCyclones } from '@/sources/jma-typhoon'
import { fetchInformation } from '@/sources/jma-information'
import { fetchLightningStrokes, fetchThunderSeries, type TileFieldKind } from '@/sources/jma-tile'
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
    atmosphere: {
      cyclones: (signal) => fetchCyclones(signal),
      information: (signal) => fetchInformation(signal),
      thunder: (signal) => fetchThunderSeries(signal),
      strokes: (signal) => fetchLightningStrokes(signal),
      async sample(kind, frame, series, point, radiusKm, signal) {
        // z8: ~0.6 km per pixel at Japan's latitudes.
        const radiusPx = Math.max(0, Math.round(radiusKm / 0.5))
        try {
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
