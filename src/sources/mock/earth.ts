/**
 * Synthetic Earth-observation data for the mock provider. Every scenario is
 * deterministic relative to the (possibly pinned) clock, so screenshots and
 * E2E assertions are reproducible.
 */
import type { SourceObservation } from '@/domain/earth/common'
import type { IntensityObservation, LightningStroke } from '@/domain/earth/events'
import type {
  FieldClass,
  FieldSample,
  PointSeries,
  RasterFieldKind,
  RasterFieldSeries,
  RasterFrame,
} from '@/domain/earth/fields'
import type { QuakeSolution, TsunamiReport } from '@/domain/earth/reports'
import type { Provenance } from '@/domain/model'
import { addMinutes, epoch, jstDateKey, toInstant, type Instant } from '@/domain/time'
import { adaptAreas, areasSchema, reportObservation, type TsunamiAreaLines } from '../jma-tsunami'
import tsunamiAreasFixture from '../jma-tsunami/fixtures/areas-subset.json'
import { cycloneObservation, type CycloneReport } from '../jma-typhoon'
import {
  buildKikikuru,
  buildSeries,
  FIELD_SPECS,
  type KikikuruSeries,
  type SnowSeries,
  type TargetTime,
} from '../jma-tile'
import type { DischargeKey } from '../openmeteo-flood'
import { adaptAir, airSchema, type AirQuality } from '../openmeteo-air'
import airFixture from '../openmeteo-air/fixtures/air-tokyo.json'
import {
  adaptMarine,
  GRID_LATS,
  GRID_LONS,
  marineSchema,
  type MarineGrid,
  type MarineState,
} from '../openmeteo-marine'
import marineFixture from '../openmeteo-marine/fixtures/marine-tokyo.json'
import {
  adaptOvation,
  adaptSpaceWeather,
  ovationSchemaParse,
  type AuroraGrid,
  type SpaceWeather,
} from '../swpc'
import swAlerts from '../swpc/fixtures/alerts.json'
import swFlares from '../swpc/fixtures/xray-flares-latest.json'
import swKp from '../swpc/fixtures/noaa-planetary-k-index.json'
import swKp1m from '../swpc/fixtures/planetary_k_index_1m.json'
import swPropagated from '../swpc/fixtures/propagated-solar-wind-1-hour.json'
import ovationFixture from '../swpc/fixtures/ovation-subset.json'
import { adaptEonet, eonetObservation, eonetSchema, type EonetEvent } from '../eonet'
import eonetFixture from '../eonet/fixtures/events-open.json'
import { adaptGdacs, gdacsSchema, type GdacsAssessment } from '../gdacs'
import gdacsFixture from '../gdacs/fixtures/events.json'
import type { FirmsFeed, NhcFeed } from '../relay'
import { PALETTES } from '../jma-tile/palettes'
import { adaptInformation } from '../jma-information'
import {
  adaptSites,
  adaptWarnings,
  listSchema as volcanoListSchema,
  volcanoObservation,
  warningSchema as volcanoWarningSchema,
  type VolcanoFeed,
} from '../jma-volcano'
import volcanoListFixture from '../jma-volcano/fixtures/volcano_list.json'
import volcanoWarningFixture from '../jma-volcano/fixtures/warning.json'
import type { HazardAssessment } from '@/domain/earth/assessments'
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

// ── Lightning / tornado ─────────────────────────────────────────────────────

const stamp = (t: Instant) => {
  const d = new Date(epoch(t))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`
}

/** Thunder nowcast time lists shaped like JMA's N3 (5-min analyses, 10-min nowcasts). */
export function synthThunder(now: Instant): {
  lightning: RasterFieldSeries
  tornado: RasterFieldSeries
} {
  const base = addMinutes(now, -((epoch(now) / 60000) % 5) - 5)
  const entries: TargetTime[] = []
  for (let m = -55; m <= 0; m += 5) {
    const t = stamp(addMinutes(base, m))
    entries.push({ basetime: t, validtime: t, elements: ['thns', 'trns', 'liden'] })
  }
  for (let m = 10; m <= 60; m += 10)
    entries.push({
      basetime: stamp(base),
      validtime: stamp(addMinutes(base, m)),
      elements: ['thns', 'trns'],
    })
  return {
    lightning: buildSeries(FIELD_SPECS['lightning-activity'], entries, now),
    tornado: buildSeries(FIELD_SPECS['tornado-probability'], entries, now),
  }
}

/** A thunderstorm line crossing Tokyo south-west → north-east over the past hour. */
export function synthStrokes(
  now: Instant,
  scenario: Scenario,
): { strokes: LightningStroke[]; frames: Instant[] } {
  const end = addMinutes(now, -((epoch(now) / 60000) % 5) - 5)
  const frames = Array.from({ length: 12 }, (_, i) => addMinutes(end, -5 * i))
  if (scenario !== 'storm') return { strokes: [], frames }
  const strokes: LightningStroke[] = []
  frames.forEach((fEnd, i) => {
    const k = 11 - i // 0 (oldest) … 11 (newest)
    const cLat = 35.25 + k * 0.04
    const cLon = 139.05 + k * 0.07
    for (let j = 0; j < 6; j++) {
      const a = (j * 137.5 * Math.PI) / 180
      const r = 0.03 + (j % 3) * 0.03
      strokes.push({
        lat: cLat + Math.sin(a) * r,
        lon: cLon + Math.cos(a) * r,
        kind: j % 3 === 0 ? 'cg' : 'cc',
        windowStart: addMinutes(fEnd, -5),
        windowEnd: fEnd,
      })
    }
  })
  return { strokes, frames }
}

/** Local class of a field in the storm scenario (otherwise nothing drawn). */
export function synthSample(
  kind: RasterFieldKind,
  frame: RasterFrame,
  series: RasterFieldSeries,
  scenario: Scenario,
): FieldSample<FieldClass> {
  const pal = PALETTES[kind]
  // Storm scenario: 雷活動度3, 竜巻発生確度1, 土砂「警戒」, 浸水「注意」at the location.
  const stormClass: Partial<Record<RasterFieldKind, number>> = {
    'lightning-activity': 2,
    'tornado-probability': 0,
    'kikikuru-land': 2,
    'kikikuru-inundation': 1,
  }
  const i = scenario === 'storm' ? stormClass[kind] : undefined
  const cls = i != null ? pal.classes[i]! : null
  return {
    value: cls ? { cls: cls.cls, value: cls.value, label: cls.label } : null,
    validFrom: frame.validFrom,
    validUntil: frame.validUntil,
    role: frame.role,
    decode: 'decoded',
    provenance: { ...series.provenance, decode: 'decoded' },
  }
}

/** Weather information: storm scenario issues 大雨 information for Tokyo. */
export function synthInformation(now: Instant, scenario: Scenario): HazardAssessment[] {
  const issued = addMinutes(now, -40)
  const rows = [
    {
      code: '010900',
      office: '福岡管区気象台',
      title: '少雨に関する九州北部地方（山口県を含む）気象情報',
      type: 'centers',
    },
  ]
  if (scenario === 'storm')
    rows.push({
      code: '130000',
      office: '気象庁',
      title: '東京都気象解説情報（大雨・落雷・突風）',
      type: 'offices',
    })
  return adaptInformation(
    rows.map((r, i) => ({
      controlTitle: '府県気象解説情報',
      headTitle: r.title,
      publishingOffice: r.office,
      reportDatetime: issued,
      validDatetime: addMinutes(now, 12 * 60),
      eventId: `mock-info-${i}`,
      infoType: '発表',
      areaType: r.type,
      areaCode: r.code,
      jsonName: `mock-info-${i}`,
    })),
    now,
  )
}

/**
 * Volcanoes: the real catalogue and the bulletins of 2026-10-04 (fixture);
 * the eruption scenario adds a level-4 warning for Sakurajima issued 20 min ago.
 */
export function synthVolcanoes(now: Instant, scenario: Scenario): VolcanoFeed {
  const sites = adaptSites(volcanoListSchema.parse(volcanoListFixture))
  const warnings = volcanoWarningSchema.parse(volcanoWarningFixture)
  let reports = adaptWarnings(warnings, sites)
  if (scenario === 'eruption') {
    const sakurajima = sites.find((v) => v.code === '506')!
    reports = [
      {
        site: sakurajima,
        issuedAt: addMinutes(now, -20),
        levelCode: '14',
        levelName: 'レベル４（高齢者等避難）',
        lastCode: '13',
        condition: '引上げ',
        municipalities: ['鹿児島県鹿児島市: 噴火警報（居住地域）：高齢者等避難'],
      },
      ...reports.filter((r) => r.site.code !== '506'),
    ]
  }
  return { sites, reports: reports.map((r) => volcanoObservation(r, now)) }
}

/** キキクル analyses every 10 minutes over the past hour. */
export function synthKikikuru(now: Instant): KikikuruSeries {
  const base = addMinutes(now, -((epoch(now) / 60000) % 10) - 10)
  const entries: TargetTime[] = []
  for (let m = -50; m <= 0; m += 10) {
    const t = stamp(addMinutes(base, m))
    entries.push({
      basetime: t,
      validtime: t,
      member: 'none',
      elements: ['land', 'inund', 'flood'],
    })
  }
  return buildKikikuru(entries, now)
}

/** GloFAS-like discharge: rising sharply in the storm scenario. */
export function synthRiver(now: Instant, scenario: Scenario): PointSeries<DischargeKey> {
  const today = jstDateKey(now)
  const days = Array.from({ length: 21 }, (_, i) =>
    addMinutes(`${today}T00:00:00+09:00`, (i - 7) * 1440),
  )
  const base = 120
  return {
    lat: 35.675,
    lon: 139.775,
    units: { discharge: 'm³/s', median: 'm³/s', max: 'm³/s', p75: 'm³/s' },
    points: days.map((t, i) => {
      const d = i - 7
      const q =
        scenario === 'storm'
          ? base * (1 + 3 * Math.exp(-(((d - 1) / 1.5) ** 2)))
          : base * (1 - d * 0.02)
      return {
        time: t,
        role: d < 0 ? ('analysis' as const) : ('forecast' as const),
        values: {
          discharge: Math.round(q),
          median: Math.round(q * 0.95),
          max: Math.round(q * 1.6),
          p75: Math.round(q * 1.15),
        },
      }
    }),
    derivation: 'modeled',
    provenance: {
      source: 'openmeteo-flood',
      kind: 'model',
      label: 'MOCK GloFAS',
      retrievedAt: now,
      role: 'forecast',
      derivation: 'modeled',
      sourceRole: 'forecast',
    },
  }
}

/** Air quality: the real CAMS response for Tokyo (fixture) re-timed to now. */
export function synthAir(now: Instant): AirQuality {
  const a = adaptAir(airSchema.parse(airFixture), now, now)
  const shift = epoch(now) - epoch(a.at)
  const at = (t: Instant) => toInstant(epoch(t) + shift - ((epoch(t) + shift) % 3_600_000))
  return {
    ...a,
    at: at(a.at),
    series: {
      ...a.series,
      points: a.series.points.map((p) => ({
        ...p,
        time: at(p.time),
        role: at(p.time) <= now ? ('analysis' as const) : ('forecast' as const),
      })),
      provenance: { ...a.series.provenance, observedAt: at(a.at) },
    },
  }
}

/** Marine state: the real Tokyo Bay response; the typhoon scenario raises the sea. */
export function synthMarine(now: Instant, scenario: Scenario): MarineState {
  const m = adaptMarine(marineSchema.parse(marineFixture), { lat: 35.68, lon: 139.77 }, now, now)
  if (scenario !== 'typhoon') return { ...m, at: now }
  return {
    ...m,
    at: now,
    current: { ...m.current, wave_height: 6.8, wave_period: 11.5, swell_wave_height: 5.2 },
  }
}

/** Snow analyses (hourly) and forecasts; October: nothing drawn. */
export function synthSnow(now: Instant): SnowSeries {
  const base = addMinutes(now, -((epoch(now) / 60000) % 60) - 60)
  const entries: TargetTime[] = []
  for (let h = -5; h <= 0; h++) {
    const t = stamp(addMinutes(base, h * 60))
    entries.push({ basetime: t, validtime: t, elements: ['snowd', 'snowf03h'] })
  }
  for (let h = 1; h <= 6; h++)
    entries.push({
      basetime: stamp(base),
      validtime: stamp(addMinutes(base, h * 60)),
      elements: ['snowd', 'snowf03h'],
    })
  return {
    depth: buildSeries(FIELD_SPECS['snow-depth'], entries, now),
    snowfall: buildSeries(FIELD_SPECS['snowfall-3h'], entries, now),
  }
}

/** A smooth synthetic wave field; the typhoon scenario adds a high sea south of Kanto. */
export function synthMarineGrid(now: Instant, scenario: Scenario): MarineGrid {
  const cells: MarineGrid['cells'] = []
  for (const lat of GRID_LATS)
    for (const lon of GRID_LONS) {
      // Rough land mask: skip cells over Honshu / Kyushu / Hokkaido / the continent.
      const land =
        (lon <= 129 && lat >= 33) ||
        (lon >= 132 && lon <= 141 && lat >= 33 && lat <= 40) ||
        (lon >= 141 && lon <= 144 && lat >= 42 && lat <= 45)
      if (land) continue
      const storm =
        scenario === 'typhoon' ? 6 * Math.exp(-(((lat - 31) / 3) ** 2 + ((lon - 138) / 4) ** 2)) : 0
      cells.push({
        lat,
        lon,
        wave: Math.round((1 + 0.06 * (45 - lat) + storm) * 10) / 10,
        dir: 90 + lat,
        sst: Math.round((31 - 0.45 * (lat - 24)) * 10) / 10,
      })
    }
  return { at: now, cells }
}

/**
 * Space weather from real SWPC products (fixtures, 2026-10-04: Kp 5, G1 watch);
 * the geomag scenario turns it into a G3 storm with fast solar wind.
 */
export function synthSpaceWeather(now: Instant, scenario: Scenario): SpaceWeather {
  const sw = adaptSpaceWeather({
    speed: [{ proton_speed: 520, time_tag: '2026-10-04T13:10:00Z' }],
    mag: [{ bt: 16, bz_gsm: -2, time_tag: '2026-10-04T13:10:00Z' }],
    propagated: swPropagated as Array<Array<string | number | null>>,
    kp: swKp as Array<{ time_tag: string; Kp: number }>,
    kp1m: swKp1m as Array<{ time_tag: string; estimated_kp: number | null }>,
    flares: swFlares as Array<{ time_tag: string; current_class: string | null }>,
    alerts: swAlerts as Array<{ product_id: string; issue_datetime: string; message: string }>,
  })
  // Re-time everything so the newest values are a few minutes old.
  const shift = epoch(now) - epoch(sw.solarWind.at ?? now) - 5 * 60_000
  const at = (t: Instant | null) => (t ? toInstant(epoch(t) + shift) : null)
  const base: SpaceWeather = {
    ...sw,
    solarWind: { ...sw.solarWind, at: at(sw.solarWind.at) },
    windSeries: sw.windSeries.map((p) => ({ ...p, t: at(p.t)! })),
    kp: {
      estimated: scenario === 'geomag' ? 7.33 : 2.33,
      estimatedAt: at(sw.kp.estimatedAt),
      series: sw.kp.series.map((p) => ({ ...p, t: at(p.t)! })),
    },
    xray: { ...sw.xray, at: at(sw.xray.at), maxAt: at(sw.xray.maxAt) },
    scales: { ...sw.scales, at: at(sw.scales.at) },
    alerts: sw.alerts.map((a) => ({ ...a, issuedAt: at(a.issuedAt)! })),
  }
  if (scenario !== 'geomag') return { ...base, alerts: [] }
  return {
    ...base,
    solarWind: { ...base.solarWind, speed: 780, bz: -18, bt: 24 },
    scales: { ...base.scales, current: { G: 3, S: 1, R: 1 } },
    alerts: [
      {
        id: 'mock-k07a',
        productId: 'K07A',
        issuedAt: addMinutes(now, -25),
        kind: 'ALERT',
        title: 'Geomagnetic K-index of 7',
        scale: 'G3',
      },
    ],
  }
}

export function synthAurora(now: Instant, scenario: Scenario): AuroraGrid {
  const g = adaptOvation(ovationSchemaParse(ovationFixture))
  const boost = scenario === 'geomag' ? 2 : 1
  return {
    observedAt: addMinutes(now, -10),
    forecastFor: addMinutes(now, 30),
    cells: g.cells.map(
      ([lon, lat, p]) => [lon, lat, Math.min(100, p * boost)] as [number, number, number],
    ),
  }
}

/** EONET and GDACS from real responses (fixtures, 2026-10-04). */
export function synthEonet(now: Instant): SourceObservation<EonetEvent>[] {
  return adaptEonet(eonetSchema.parse(eonetFixture)).map((e) => eonetObservation(e, now))
}

export function synthGdacs(now: Instant, scenario: Scenario): GdacsAssessment[] {
  const a = adaptGdacs(gdacsSchema.parse(gdacsFixture), now)
  if (scenario !== 'quake') return a
  // Quake scenario: GDACS rates the Kanto earthquake Orange.
  return [
    {
      ...a[0]!,
      id: 'gdacs:EQ:mock:1',
      level: { value: 'Orange', label: 'GDACS Orange' },
      rank: 2,
      area: { code: 'Japan', name: 'Earthquake in Japan' },
      time: { startedAt: addMinutes(now, -12), validFrom: addMinutes(now, -12) },
      values: { eventtype: 'EQ', lat: 36.12, lon: 140.21 },
    },
    ...a,
  ]
}

/** FIRMS-like detections: a cluster in Kyushu (storm-free scenarios) and abroad. */
export function synthFirms(now: Instant): FirmsFeed {
  const pts: Array<[number, number, number]> = [
    [32.79, 130.73, 18],
    [32.8, 130.75, 42],
    [32.81, 130.74, 9],
    [32.78, 130.76, 25],
    [-17.5, 128.2, 120],
    [-17.52, 128.25, 95],
    [-17.48, 128.22, 60],
    [38.9, -121.1, 300],
    [38.91, -121.12, 210],
    [38.92, -121.09, 150],
    [38.95, -121.15, 80],
    [10.2, 20.5, 12],
  ]
  return {
    fetchedAt: addMinutes(now, -20),
    total: pts.length,
    detections: pts.map(([lat, lon, frp], i) => ({
      id: `mock-fire-${i}`,
      lat,
      lon,
      detectedAt: addMinutes(now, -60 - i * 10),
      frpMw: frp,
      confidence: 'nominal' as const,
      satellite: 'N20',
      daynight: 'D' as const,
    })),
  }
}

export function synthNhc(now: Instant): NhcFeed {
  return {
    fetchedAt: addMinutes(now, -30),
    storms: [
      {
        id: 'ep182026',
        name: 'Rachel',
        classification: 'HU',
        intensityKt: 85,
        pressureMb: 975,
        lat: 18.2,
        lon: -105.3,
        movementDir: 300,
        movementSpeedKt: 9,
        lastUpdate: addMinutes(now, -90),
      },
    ],
  }
}
