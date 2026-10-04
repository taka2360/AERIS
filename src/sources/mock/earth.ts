/**
 * Synthetic Earth-observation data for the mock provider. Every scenario is
 * deterministic relative to the (possibly pinned) clock, so screenshots and
 * E2E assertions are reproducible.
 */
import type { SourceObservation } from '@/domain/earth/common'
import type { IntensityObservation } from '@/domain/earth/events'
import type { QuakeSolution, TsunamiReport } from '@/domain/earth/reports'
import type { Provenance } from '@/domain/model'
import { addMinutes, epoch, type Instant } from '@/domain/time'
import { adaptAreas, areasSchema, reportObservation, type TsunamiAreaLines } from '../jma-tsunami'
import tsunamiAreasFixture from '../jma-tsunami/fixtures/areas-subset.json'
import { cycloneObservation, type CycloneReport } from '../jma-typhoon'
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

/** An offshore great earthquake that triggers tsunami warnings for Kanto coasts. */
function offshoreQuake(now: Instant): { jma: Obs[]; usgs: Obs[] } {
  const main = addMinutes(now, -14)
  return {
    jma: [
      jmaObs(
        'm-j-tsu',
        main,
        {
          lat: 35.0,
          lon: 141.8,
          depthKm: 20,
          magnitude: { value: 7.6, type: 'Mj' },
          areaName: '房総半島東方沖',
          maxIntensity: '5-',
          stations: [
            { code: '1220500', name: '銚子市川口町', lat: 35.73, lon: 140.83, intensity: '5-' },
            { code: '1310100', name: '千代田区大手町', lat: 35.69, lon: 139.76, intensity: '3' },
          ],
          comments: ['津波警報等(大津波警報・津波警報あるいは津波注意報)を発表中です。'],
        },
        now,
      ),
    ],
    usgs: [
      usgsObs(
        'm-u-tsu',
        addMinutes(main, 0.3),
        {
          lat: 34.92,
          lon: 141.95,
          depthKm: 25,
          magnitude: { value: 7.5, type: 'mww' },
          areaName: 'off the east coast of Honshu, Japan',
          tsunamiFlag: true,
        },
        now,
      ),
    ],
  }
}

export function synthQuakes(now: Instant, scenario: Scenario): { jma: Obs[]; usgs: Obs[] } {
  const bg = background(now)
  const extra =
    scenario === 'quake' ? strongQuake(now) : scenario === 'tsunami' ? offshoreQuake(now) : null
  return extra ? { jma: [...extra.jma, ...bg.jma], usgs: [...extra.usgs, ...bg.usgs] } : bg
}

/** Tsunami bulletins: the tsunami scenario's warnings, else nothing recent. */
export function synthTsunami(now: Instant, scenario: Scenario): SourceObservation<TsunamiReport>[] {
  if (scenario !== 'tsunami') return []
  const origin = toMinute(addMinutes(now, -14))
  const issued = addMinutes(origin, 3)
  const report: TsunamiReport = {
    eventId: 'm-j-tsu',
    issuedAt: issued,
    title: '津波警報・注意報・予報a',
    headline: '津波警報を発表しました。',
    cancelled: false,
    forecasts: [
      {
        areaCode: '310',
        areaName: '千葉県九十九里・外房',
        kindCode: '51',
        kindName: '津波警報',
        maxHeight: '3',
        firstArrival: addMinutes(origin, 12),
        firstArrivalCondition: '第１波の到達を確認',
      },
      {
        areaCode: '300',
        areaName: '茨城県',
        kindCode: '51',
        kindName: '津波警報',
        maxHeight: '3',
        firstArrival: addMinutes(origin, 20),
      },
      {
        areaCode: '312',
        areaName: '東京湾内湾',
        kindCode: '62',
        kindName: '津波注意報',
        maxHeight: '1',
        firstArrival: addMinutes(origin, 50),
      },
      {
        areaCode: '311',
        areaName: '千葉県内房',
        kindCode: '62',
        kindName: '津波注意報',
        maxHeight: '1',
        firstArrival: addMinutes(origin, 30),
      },
      {
        areaCode: '330',
        areaName: '相模湾・三浦半島',
        kindCode: '62',
        kindName: '津波注意報',
        maxHeight: '1',
        firstArrival: addMinutes(origin, 35),
      },
    ],
    observations: [
      {
        station: '銚子',
        areaName: '千葉県九十九里・外房',
        firstArrival: addMinutes(origin, 12),
        initial: '押し',
        maxHeight: '0.6',
        maxHeightAt: addMinutes(origin, 13),
        condition: '上昇中',
      },
    ],
    origin: { time: origin, areaName: '房総半島東方沖', lat: 35.0, lon: 141.8, magnitude: 7.6 },
    comments: [
      '津波による被害が発生します。沿岸部や川沿いにいる人は、ただちに高台や避難ビルなど安全な場所へ避難してください。',
    ],
  }
  return [reportObservation(report, now)]
}

export function synthTsunamiAreas(): TsunamiAreaLines {
  return adaptAreas(areasSchema.parse(tsunamiAreasFixture))
}

/**
 * Cyclones: in the typhoon scenario a very strong typhoon approaches Kanto
 * (the monitoring location ends up in its forecast storm-warning area);
 * otherwise a distant tropical storm east of the Philippines.
 */
export function synthCyclones(
  now: Instant,
  scenario: Scenario,
): SourceObservation<CycloneReport>[] {
  const hour = addMinutes(now, -((epoch(now) / 60000) % 60))
  const issued = addMinutes(hour, -15)
  const analysis = addMinutes(hour, -60)
  const near = scenario === 'typhoon'
  const pts: Array<[number, number, number, number, number, number]> = near
    ? // [hours, lat, lon, hPa, wind m/s, circle km]
      [
        [0, 30.2, 136.4, 940, 45, 0],
        [12, 33.1, 138.2, 950, 40, 70],
        [24, 36.0, 140.6, 965, 35, 110],
        [48, 41.5, 146.0, 980, 30, 200],
      ]
    : [
        [0, 13.5, 131.2, 996, 20, 0],
        [24, 15.0, 128.4, 990, 23, 120],
        [48, 17.2, 125.9, 985, 25, 200],
      ]
  const points = pts.map(([h, lat, lon, hpa, w, c]) => ({
    validAt: addMinutes(analysis, h * 60),
    lat,
    lon,
    pressureHpa: hpa,
    maxWindMs: w,
    circleKm: c || undefined,
    stormAreaKm: near ? 190 + h * 3 : undefined,
    role: h === 0 ? ('analysis' as const) : ('forecast' as const),
  }))
  const report: CycloneReport = {
    id: near ? 'TC-MOCK-21' : 'TC-MOCK-22',
    number: near ? '2621' : '2622',
    name: near ? 'モックタイフーン' : 'モックストーム',
    issuedAt: issued,
    category: near ? 'TY' : 'TS',
    categoryLabel: near ? '台風' : '台風',
    intensityClass: near ? '非常に強い' : undefined,
    sizeClass: near ? '大型' : undefined,
    location: near ? '四国沖' : 'フィリピンの東',
    maxGustMs: near ? 60 : 30,
    detail: {
      name: near ? 'モックタイフーン' : 'モックストーム',
      number: near ? '2621' : '2622',
      category: near ? 'TY' : 'TS',
      categoryLabel: '台風',
      intensityClass: near ? '非常に強い' : undefined,
      sizeClass: near ? '大型' : undefined,
      observedPosition: points[0],
      observedTrack: [],
      observedPath: near
        ? [
            [131.5, 24.0],
            [133.6, 26.8],
            [135.2, 28.9],
            [136.4, 30.2],
          ]
        : [
            [134.0, 12.2],
            [131.2, 13.5],
          ],
      forecasts: [{ issuedAt: issued, points }],
      galeArea: near ? { lat: 30.2, lon: 136.4, radiusKm: 650 } : undefined,
      movement: { directionText: near ? '北東' : '西北西', speedKmh: near ? 30 : 15 },
    },
  }
  return [cycloneObservation(report, now)]
}
