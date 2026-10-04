/**
 * Current conditions = observation first, model as fallback — decided per field.
 * A station value is used only if the station is close enough and the reading
 * is recent enough; otherwise the model value fills in.
 */
import type {
  CurrentConditions,
  CurrentField,
  Provenance,
  StationObservation,
} from '@/domain/model'
import { dewPointC } from '@/domain/derive'
import { minutesBetween, type Instant } from '@/domain/time'

export const OBS_MAX_DISTANCE_KM = 20
export const OBS_MAX_AGE_MIN = 20

type StationField = Exclude<
  keyof StationObservation,
  'id' | 'name' | 'lat' | 'lon' | 'distanceKm' | 'observedAt'
>

/** Current-condition fields that AMeDAS can supply, and the station key that holds them. */
const OBSERVABLE: Partial<Record<CurrentField, StationField>> = {
  temperature: 'temperature',
  humidity: 'humidity',
  pressure: 'pressure',
  precipitation1h: 'precipitation1h',
  windSpeed: 'windSpeed',
  windDirection: 'windDirection',
  gust: 'gust',
  sunshine1h: 'sunshine1h',
  visibility: 'visibility',
}

export function mergeCurrent(input: {
  model?: CurrentConditions
  stations?: StationObservation[]
  stationsRetrievedAt?: Instant
  now: Instant
}): CurrentConditions {
  const { model = {}, stations = [], now } = input
  const usable = stations
    .filter((s) => s.distanceKm <= OBS_MAX_DISTANCE_KM)
    .filter((s) => minutesBetween(s.observedAt, now) <= OBS_MAX_AGE_MIN)
    .sort((a, b) => a.distanceKm - b.distanceKm)

  const merged: CurrentConditions = { ...model }
  for (const [field, key] of Object.entries(OBSERVABLE) as Array<[CurrentField, StationField]>) {
    const station = usable.find((s) => s[key] != null)
    if (!station) continue
    const value = station[key] as number
    const provenance: Provenance = {
      source: 'jma-amedas',
      kind: 'observation',
      label: `AMeDAS ${station.name}`,
      observedAt: station.observedAt,
      retrievedAt: input.stationsRetrievedAt ?? now,
      distanceKm: station.distanceKm,
    }
    ;(merged as Record<CurrentField, unknown>)[field] = { value, provenance }
  }

  // Dew point derived from observed temperature + humidity at the same station.
  const t = merged.temperature
  const rh = merged.humidity
  if (
    t?.provenance.kind === 'observation' &&
    rh?.provenance.kind === 'observation' &&
    t.provenance.label === rh.provenance.label
  ) {
    merged.dewPoint = {
      value: dewPointC(t.value, rh.value),
      provenance: { ...rh.provenance, label: `${rh.provenance.label} (calc)` },
    }
  }
  return merged
}

/** The station chosen as primary reference (nearest usable). */
export function primaryStation(stations: StationObservation[] | undefined, now: Instant) {
  return stations
    ?.filter(
      (s) =>
        s.distanceKm <= OBS_MAX_DISTANCE_KM && minutesBetween(s.observedAt, now) <= OBS_MAX_AGE_MIN,
    )
    .sort((a, b) => a.distanceKm - b.distanceKm)[0]
}
