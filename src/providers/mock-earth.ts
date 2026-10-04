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
