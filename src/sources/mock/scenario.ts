/** Reproducible situations for the mock provider (`?mock&scenario=…`). */
export type Scenario = 'quiet' | 'quake' | 'tsunami' | 'typhoon' | 'storm' | 'eruption' | 'geomag'

export const SCENARIOS: Scenario[] = [
  'quiet',
  'quake',
  'tsunami',
  'typhoon',
  'storm',
  'eruption',
  'geomag',
]
