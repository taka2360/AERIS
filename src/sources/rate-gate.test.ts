import { describe, expect, it } from 'vitest'
import { openMeteoCost } from './openmeteo-quota'
import { parseRetryAfter, RateGate } from './rate-gate'

function gate() {
  let t = 0
  const g = new RateGate({
    windows: [
      { ms: 60_000, limit: 100, bulkLimit: 60 },
      { ms: 3_600_000, limit: 300, bulkLimit: 200 },
    ],
    cooldownMs: 60_000,
    now: () => t,
  })
  return { g, advance: (ms: number) => (t += ms) }
}

describe('RateGate', () => {
  it('admits requests until a window is full, then refuses until it rolls over', () => {
    const { g, advance } = gate()
    expect(g.acquire({ cost: 70 })).toBeNull()
    advance(10_000)
    const refused = g.acquire({ cost: 40 })
    expect(refused).toMatchObject({ kind: 'rate_limited', retryable: true, retryAfterMs: 50_000 })
    expect(g.acquire({ cost: 30 })).toBeNull()
    advance(50_000)
    expect(g.acquire({ cost: 40 })).toBeNull()
  })

  it('caps bulk requests below the overall limit, leaving room for the rest', () => {
    const { g } = gate()
    expect(g.acquire({ cost: 50, bulk: true })).toBeNull()
    expect(g.acquire({ cost: 20, bulk: true })).not.toBeNull()
    expect(g.acquire({ cost: 40 })).toBeNull()
  })

  it('applies the longer window too', () => {
    const { g, advance } = gate()
    for (let i = 0; i < 3; i++) {
      expect(g.acquire({ cost: 100 })).toBeNull()
      advance(60_000)
    }
    expect(g.acquire({ cost: 1 })?.kind).toBe('rate_limited')
  })

  it('lets an oversized request through on an empty window', () => {
    const { g } = gate()
    expect(g.acquire({ cost: 150 })).toBeNull()
  })

  it('blocks everything during the cool-down after a 429', () => {
    const { g, advance } = gate()
    expect(g.rejected()).toBe(60_000)
    expect(g.acquire({ cost: 1 })).toMatchObject({ kind: 'rate_limited', retryAfterMs: 60_000 })
    advance(60_000)
    expect(g.acquire({ cost: 1 })).toBeNull()
    g.rejected(5_000)
    expect(g.acquire({ cost: 1 })?.retryAfterMs).toBe(5_000)
  })
})

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('120')).toBe(120_000)
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:10 GMT', 4_000)).toBe(6_000)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })
})

describe('openMeteoCost', () => {
  it('counts locations, and extra for many variables or long ranges', () => {
    expect(openMeteoCost(100, 2)).toBe(100)
    expect(openMeteoCost(1, 25)).toBe(2.5)
    expect(openMeteoCost(1, 4, 21)).toBe(1.5)
  })
})
