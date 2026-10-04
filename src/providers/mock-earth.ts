/**
 * Mock Earth-observation provider: scenario data through the same facade and
 * the same latency / failure injection as the weather mock.
 */
import type { Provenance, SourceId } from '@/domain/model'
import type { SourceResult } from '@/domain/result'
import type { Instant } from '@/domain/time'
import type { EarthProvider } from '@/services/earth/provider'
import {
  synthCyclones,
  synthInformation,
  synthQuakes,
  synthSample,
  synthStrokes,
  synthThunder,
  synthTsunami,
  synthTsunamiAreas,
  synthVolcanoes,
  synthKikikuru,
  synthRiver,
  synthAir,
  synthMarine,
  synthSnow,
  synthMarineGrid,
  synthSpaceWeather,
  synthAurora,
} from '@/sources/mock/earth'
import type { Scenario } from '@/sources/mock/scenario'

export type MockRunner = <T>(
  source: SourceId,
  kind: Provenance['kind'],
  label: string,
  signal: AbortSignal | undefined,
  make: (prov: Provenance) => T,
) => Promise<SourceResult<T>>

export function createMockEarthProvider(
  run: MockRunner,
  now: () => Instant,
  scenario: Scenario,
): EarthProvider {
  return {
    seismic: {
      jma: (signal) =>
        run('jma-quake', 'official', 'MOCK JMA', signal, () => synthQuakes(now(), scenario).jma),
      usgs: (signal) =>
        run(
          'usgs-quake',
          'observation',
          'MOCK USGS',
          signal,
          () => synthQuakes(now(), scenario).usgs,
        ),
      // Mock observations already carry their station intensities.
      jmaDetail: (obs, signal) => run('jma-quake', 'official', 'MOCK JMA', signal, () => obs),
    },
    tsunami: {
      reports: (signal) =>
        run('jma-tsunami', 'official', 'MOCK JMA', signal, () => synthTsunami(now(), scenario)),
      areas: (signal) => run('jma-tsunami', 'official', 'MOCK JMA', signal, synthTsunamiAreas),
    },
    volcano: {
      volcanoes: (signal) =>
        run('jma-volcano', 'official', 'MOCK JMA', signal, () => synthVolcanoes(now(), scenario)),
    },
    space: {
      weather: (signal) =>
        run('swpc', 'observation', 'MOCK SWPC', signal, () => synthSpaceWeather(now(), scenario)),
      aurora: (signal) =>
        run('swpc', 'forecast', 'MOCK OVATION', signal, () => synthAurora(now(), scenario)),
    },
    environment: {
      air: (_p, signal) =>
        run('openmeteo-air', 'model', 'MOCK CAMS', signal, () => synthAir(now())),
      marine: (_p, signal) =>
        run('openmeteo-marine', 'model', 'MOCK MARINE', signal, () => synthMarine(now(), scenario)),
      snow: (signal) => run('jma-snow', 'official', 'MOCK JMA', signal, () => synthSnow(now())),
      marineGrid: (signal) =>
        run('openmeteo-marine', 'model', 'MOCK MARINE', signal, () =>
          synthMarineGrid(now(), scenario),
        ),
    },
    hydrology: {
      kikikuru: (signal) =>
        run('jma-risk', 'official', 'MOCK JMA', signal, () => synthKikikuru(now())),
      river: (_p, signal) =>
        run('openmeteo-flood', 'model', 'MOCK GloFAS', signal, () => synthRiver(now(), scenario)),
    },
    atmosphere: {
      cyclones: (signal) =>
        run('jma-typhoon', 'official', 'MOCK JMA', signal, () => synthCyclones(now(), scenario)),
      information: (signal) =>
        run('jma-information', 'official', 'MOCK JMA', signal, () =>
          synthInformation(now(), scenario),
        ),
      thunder: (signal) =>
        run('jma-thunder', 'official', 'MOCK JMA', signal, () => synthThunder(now())),
      strokes: (signal) =>
        run('jma-thunder', 'observation', 'MOCK LIDEN', signal, () =>
          synthStrokes(now(), scenario),
        ),
      sample: (kind, frame, series, _point, _radiusKm, signal) =>
        run(series.provenance.source, 'official', 'MOCK JMA', signal, () =>
          synthSample(kind, frame, series, scenario),
        ),
    },
  }
}
