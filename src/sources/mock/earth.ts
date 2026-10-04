/**
 * Synthetic Earth-observation data for the mock provider. Every scenario is
 * deterministic relative to the (possibly pinned) clock, so screenshots and
 * E2E assertions are reproducible.
 */
import type { SourceObservation } from '@/domain/earth/common'
import type { IntensityObservation } from '@/domain/earth/events'
import type { QuakeSolution } from '@/domain/earth/reports'
import type { Provenance } from '@/domain/model'
import { addMinutes, epoch, type Instant } from '@/domain/time'
import type { Scenario } from './scenario'

type Obs = SourceObservation<QuakeSolution>

/** Truncate to the minute, like JMA's list times. */
const toMinute = (t: Instant) => addMinutes(t, -((epoch(t) / 1000) % 60) / 60)

function jmaObs(
  id: string,
  t: Instant,
  q: Omit<QuakeSolution, 'originTime'>,
  now: Instant,
  preliminary = false,
): Obs {
  const originTime = toMinute(t)
  const prov: Provenance = {
    source: 'jma-quake',
    kind: 'official',
    label: 'MOCK JMA 震源・震度情報',
    issuedAt: addMinutes(originTime, 4),
    observedAt: originTime,
    retrievedAt: now,
    role: 'observed',
    derivation: 'measured',
    quality: preliminary ? 'preliminary' : 'confirmed',
    sourceRole: 'observation',
  }
  return {
    source: 'jma-quake',
    nativeId: id,
    sourceRole: 'observation',
    time: { startedAt: originTime, issuedAt: prov.issuedAt },
    data: { originTime, bulletin: '震源・震度情報', ...q },
    provenance: prov,
  }
}

function usgsObs(id: string, t: Instant, q: Omit<QuakeSolution, 'originTime'>, now: Instant): Obs {
  const prov: Provenance = {
    source: 'usgs-quake',
    kind: 'observation',
    label: 'MOCK USGS REVIEWED',
    observedAt: t,
    issuedAt: addMinutes(t, 20),
    retrievedAt: now,
    role: 'observed',
    derivation: 'measured',
    quality: 'confirmed',
    sourceRole: 'observation',
  }
  return {
    source: 'usgs-quake',
    nativeId: id,
    sourceRole: 'observation',
    time: { startedAt: t, issuedAt: prov.issuedAt },
    data: { originTime: t, ...q },
    provenance: prov,
  }
}

/** Background seismicity present in every scenario. */
function background(now: Instant): { jma: Obs[]; usgs: Obs[] } {
  const ago = (min: number) => addMinutes(now, -min)
  const jma = [
    jmaObs(
      'm-j-001',
      ago(95),
      {
        lat: 34.8,
        lon: 139.4,
        depthKm: 10,
        magnitude: { value: 2.4, type: 'Mj' },
        areaName: '伊豆大島近海',
        maxIntensity: '1',
      },
      now,
    ),
    jmaObs(
      'm-j-002',
      ago(340),
      {
        lat: 36.1,
        lon: 139.9,
        depthKm: 50,
        magnitude: { value: 3.6, type: 'Mj' },
        areaName: '茨城県南部',
        maxIntensity: '2',
      },
      now,
    ),
    jmaObs(
      'm-j-003',
      ago(610),
      {
        lat: 42.6,
        lon: 142.0,
        depthKm: 120,
        magnitude: { value: 4.1, type: 'Mj' },
        areaName: '胆振地方中東部',
        maxIntensity: '2',
      },
      now,
    ),
    jmaObs(
      'm-j-004',
      ago(1020),
      {
        lat: 31.0,
        lon: 131.9,
        depthKm: 30,
        magnitude: { value: 4.6, type: 'Mj' },
        areaName: '日向灘',
        maxIntensity: '2',
      },
      now,
    ),
  ]
  const usgs = [
    usgsObs(
      'm-u-104',
      addMinutes(ago(1020), 0.3),
      {
        lat: 30.92,
        lon: 131.98,
        depthKm: 34,
        magnitude: { value: 4.7, type: 'mb' },
        areaName: '42 km E of Nichinan, Japan',
      },
      now,
    ),
    usgsObs(
      'm-u-201',
      ago(180),
      {
        lat: -6.1,
        lon: 147.2,
        depthKm: 60,
        magnitude: { value: 5.4, type: 'mww' },
        areaName: '62 km NE of Lae, Papua New Guinea',
      },
      now,
    ),
    usgsObs(
      'm-u-202',
      ago(470),
      {
        lat: -33.2,
        lon: -71.9,
        depthKm: 25,
        magnitude: { value: 5.0, type: 'mb' },
        areaName: 'offshore Valparaíso, Chile',
      },
      now,
    ),
    usgsObs(
      'm-u-203',
      ago(820),
      {
        lat: 52.3,
        lon: -169.4,
        depthKm: 40,
        magnitude: { value: 4.8, type: 'mb' },
        areaName: 'Fox Islands, Aleutian Islands, Alaska',
      },
      now,
    ),
    usgsObs(
      'm-u-204',
      ago(1300),
      {
        lat: 37.9,
        lon: 20.6,
        depthKm: 15,
        magnitude: { value: 4.6, type: 'mb' },
        areaName: 'Ionian Sea',
      },
      now,
    ),
  ]
  return { jma, usgs }
}

const TOKYO_STATIONS: IntensityObservation[] = [
  { code: '0821700', name: '笠間市中央', lat: 36.35, lon: 140.3, intensity: '5+' },
  { code: '0820130', name: '水戸市金町', lat: 36.37, lon: 140.47, intensity: '5-' },
  { code: '0821130', name: 'つくば市天王台', lat: 36.11, lon: 140.1, intensity: '5-' },
  { code: '1220330', name: '野田市鶴奉', lat: 35.95, lon: 139.87, intensity: '4' },
  { code: '1310100', name: '千代田区大手町', lat: 35.69, lon: 139.76, intensity: '4' },
  { code: '1410300', name: '横浜中区山手町', lat: 35.43, lon: 139.65, intensity: '3' },
  { code: '1920100', name: '甲府市飯田', lat: 35.67, lon: 138.55, intensity: '2' },
]

/** A strong inland quake felt across Kanto, with aftershocks. */
function strongQuake(now: Instant): { jma: Obs[]; usgs: Obs[] } {
  const main = addMinutes(now, -12)
  const jma = [
    jmaObs(
      'm-j-main',
      main,
      {
        lat: 36.2,
        lon: 140.1,
        depthKm: 50,
        magnitude: { value: 6.1, type: 'Mj' },
        areaName: '茨城県南部',
        maxIntensity: '5+',
        stations: TOKYO_STATIONS,
        comments: ['この地震による津波の心配はありません。'],
      },
      now,
    ),
    jmaObs(
      'm-j-as1',
      addMinutes(main, 4),
      {
        lat: 36.25,
        lon: 140.15,
        depthKm: 50,
        magnitude: { value: 4.4, type: 'Mj' },
        areaName: '茨城県南部',
        maxIntensity: '3',
      },
      now,
    ),
    jmaObs(
      'm-j-as2',
      addMinutes(main, 9),
      {
        lat: 36.18,
        lon: 140.05,
        depthKm: 40,
        magnitude: { value: 3.8, type: 'Mj' },
        areaName: '茨城県南部',
        maxIntensity: '2',
      },
      now,
      true,
    ),
  ]
  const usgs = [
    usgsObs(
      'm-u-main',
      addMinutes(main, 0.2),
      {
        lat: 36.12,
        lon: 140.21,
        depthKm: 46,
        magnitude: { value: 5.9, type: 'mww' },
        areaName: '12 km W of Kasama, Japan',
      },
      now,
    ),
  ]
  return { jma, usgs }
}

export function synthQuakes(now: Instant, scenario: Scenario): { jma: Obs[]; usgs: Obs[] } {
  const bg = background(now)
  if (scenario !== 'quake' && scenario !== 'tsunami') return bg
  const strong = strongQuake(now)
  return { jma: [...strong.jma, ...bg.jma], usgs: [...strong.usgs, ...bg.usgs] }
}
