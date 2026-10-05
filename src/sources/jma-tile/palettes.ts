/**
 * Classification palettes of JMA bosai tiles, taken from JMA's own legend
 * SVGs (bosai/{nowc,risk,snow}/images/legend_*.svg, 2026-10-04).
 * Tiles are palette PNGs drawn without anti-aliasing, so decoding is an
 * EXACT colour lookup. A colour not listed here is never approximated.
 */
import type { RasterFieldKind } from '@/domain/earth/fields'

export type PaletteClass = {
  rgb: [number, number, number]
  /** Ordinal class (0 = lowest listed class) */
  cls: number
  /** Lower bound of the class in the field's unit (bands) or the level number */
  value: number
  label: string
}

export type TilePalette = {
  kind: RasterFieldKind
  unit: string
  classes: PaletteClass[]
}

const c = (rgb: [number, number, number], cls: number, value: number, label: string) => ({
  rgb,
  cls,
  value,
  label,
})

export const PALETTES: Record<RasterFieldKind, TilePalette> = {
  'precip-intensity': {
    kind: 'precip-intensity',
    unit: 'mm/h',
    classes: [
      c([242, 242, 255], 0, 0, '<1'),
      c([160, 210, 255], 1, 1, '1–5'),
      c([33, 140, 255], 2, 5, '5–10'),
      c([0, 65, 255], 3, 10, '10–20'),
      c([250, 245, 0], 4, 20, '20–30'),
      c([255, 153, 0], 5, 30, '30–50'),
      c([255, 40, 0], 6, 50, '50–80'),
      c([180, 0, 104], 7, 80, '80+'),
    ],
  },
  'lightning-activity': {
    kind: 'lightning-activity',
    unit: '活動度',
    classes: [
      c([255, 245, 0], 0, 1, '活動度1 雷可能性あり'),
      c([255, 170, 0], 1, 2, '活動度2 雷あり'),
      c([255, 40, 0], 2, 3, '活動度3 やや激しい雷'),
      c([200, 0, 255], 3, 4, '活動度4 激しい雷'),
    ],
  },
  'tornado-probability': {
    kind: 'tornado-probability',
    unit: '発生確度',
    classes: [c([250, 245, 0], 0, 1, '発生確度1'), c([255, 40, 0], 1, 2, '発生確度2')],
  },
  'kikikuru-land': kikikuru('kikikuru-land'),
  'kikikuru-inundation': kikikuru('kikikuru-inundation'),
  'kikikuru-flood': kikikuru('kikikuru-flood'),
  'snow-depth': {
    kind: 'snow-depth',
    unit: 'cm',
    classes: [
      c([160, 210, 255], 0, 0, '<5'),
      c([33, 140, 255], 1, 5, '5–20'),
      c([0, 65, 255], 2, 20, '20–50'),
      c([255, 245, 0], 3, 50, '50–100'),
      c([255, 153, 0], 4, 100, '100–150'),
      c([255, 40, 0], 5, 150, '150–200'),
      c([180, 0, 104], 6, 200, '200+'),
    ],
  },
  'snowfall-3h': {
    kind: 'snowfall-3h',
    unit: 'cm/3h',
    classes: [
      c([240, 240, 248], 0, 0, '<3'),
      c([160, 210, 255], 1, 3, '3–5'),
      c([33, 140, 255], 2, 5, '5–10'),
      c([0, 65, 255], 3, 10, '10–15'),
      c([255, 245, 0], 4, 15, '15–20'),
      c([255, 153, 0], 5, 20, '20–25'),
      c([255, 40, 0], 6, 25, '25–30'),
      c([180, 0, 104], 7, 30, '30+'),
    ],
  },
}

/** キキクル: value = 警戒レベル相当 (1 = 今後の情報等に留意). */
function kikikuru(kind: RasterFieldKind): TilePalette {
  return {
    kind,
    unit: '警戒レベル相当',
    classes: [
      c([255, 255, 255], 0, 1, '今後の情報等に留意'),
      c([242, 231, 0], 1, 2, '注意'),
      c([255, 40, 0], 2, 3, '警戒'),
      c([170, 0, 170], 3, 4, '危険'),
      c([12, 0, 12], 4, 5, '災害切迫'),
    ],
  }
}
