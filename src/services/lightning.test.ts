import { describe, expect, it } from 'vitest'
import { lightningStatus, summarizeStrokes, tornadoStatus } from '@/domain/earth/status'
import { synthStrokes, synthThunder } from '@/sources/mock/earth'

const now = '2026-10-04T16:24:00+09:00'
const tokyo = { lat: 35.68, lon: 139.77 }
const osaka = { lat: 34.69, lon: 135.5 }

describe('lightning status (AERIS rule)', () => {
  it('is NO DATA without the LIDEN feed and NOMINAL with no strokes', () => {
    expect(lightningStatus(null, null, false).status).toBe('unknown')
    const quiet = summarizeStrokes(synthStrokes(now, 'quiet').strokes, tokyo, now)
    expect(lightningStatus(quiet, 0, true).status).toBe('nominal')
  })

  it('warns for nearby cloud-to-ground strokes, but only elevates far away', () => {
    const { strokes } = synthStrokes(now, 'storm')
    const atTokyo = summarizeStrokes(strokes, tokyo, now)
    expect(atTokyo.localCg).toBeGreaterThan(0)
    expect(lightningStatus(atTokyo, 0, true).status).toBe('warning')
    const atOsaka = summarizeStrokes(strokes, osaka, now)
    expect(atOsaka.localCg).toBe(0)
    expect(lightningStatus(atOsaka, 0, true).status).toBe('active')
  })

  it('ignores strokes older than 30 minutes or after the cursor time', () => {
    const { strokes } = synthStrokes(now, 'storm')
    const later = summarizeStrokes(strokes, tokyo, '2026-10-04T18:00:00+09:00')
    expect(later.recent).toBe(0)
    const before = summarizeStrokes(strokes, tokyo, '2026-10-04T15:00:00+09:00')
    expect(before.recent).toBe(0)
  })

  it('uses the local activity level', () => {
    const none = { recent: 0, nearestKm: null, localCg: 0 }
    expect(lightningStatus(none, 3, true).status).toBe('warning')
    expect(lightningStatus(none, 1, true).status).toBe('elevated')
  })
})

describe('tornado status', () => {
  it('maps 発生確度 to status', () => {
    expect([null, 1, 2].map((p) => tornadoStatus(p, true).status)).toEqual([
      'nominal',
      'elevated',
      'warning',
    ])
  })
})

describe('thunder series', () => {
  it('has analysis frames up to now and nowcast frames after', () => {
    const { lightning } = synthThunder(now)
    expect(lightning.frames.some((f) => f.role === 'analysis')).toBe(true)
    expect(lightning.frames.some((f) => f.role === 'nowcast')).toBe(true)
  })
})
