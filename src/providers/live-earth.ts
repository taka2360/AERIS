/**
 * Live Earth-observation sources, split by domain behind the EarthProvider facade.
 */
import type { EarthProvider, SeismicProvider } from '@/services/earth/provider'
import { fetchJmaQuakeDetail, fetchJmaQuakes } from '@/sources/jma-quake'
import { fetchTsunamiAreas, fetchTsunamiReports } from '@/sources/jma-tsunami'
import { fetchCyclones } from '@/sources/jma-typhoon'
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
    },
  }
}
