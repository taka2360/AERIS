/**
 * Client-side request quota for a provider that rate-limits by IP. Requests
 * are weighted (e.g. Open-Meteo counts every location of a multi-point request
 * as a call) and checked against rolling windows before they leave the
 * browser. "Bulk" requests (map decoration) get a smaller share so they can
 * never starve the panels. After a real HTTP 429 every request is held back
 * until the provider's Retry-After (or a default cool-down) has passed.
 */
import type { SourceError } from '@/domain/result'

export type GateWindow = {
  ms: number
  /** Most weight any request may use in the window */
  limit: number
  /** Most weight bulk requests may use in the window */
  bulkLimit: number
}

export type GateOptions = {
  windows: GateWindow[]
  /** Hold-off after a 429 without a usable Retry-After */
  cooldownMs: number
  /** Clock (tests) */
  now?: () => number
}

export type GateTicket = { cost: number; bulk?: boolean }

export class RateGate {
  private readonly log: { at: number; cost: number; bulk: boolean }[] = []
  private blockedUntil = 0
  private readonly now: () => number

  constructor(private readonly opts: GateOptions) {
    this.now = opts.now ?? Date.now
  }

  /** Records the request and returns null when it may go out, else the refusal. */
  acquire({ cost, bulk = false }: GateTicket): SourceError | null {
    const t = this.now()
    const longest = Math.max(...this.opts.windows.map((w) => w.ms))
    while (this.log.length > 0 && t - this.log[0]!.at >= longest) this.log.shift()

    if (t < this.blockedUntil)
      return refusal('provider rate limit cool-down', this.blockedUntil - t)

    for (const w of this.opts.windows) {
      let used = 0
      let usedBulk = 0
      let oldest = t
      for (const e of this.log) {
        if (t - e.at >= w.ms) continue
        used += e.cost
        if (e.bulk) usedBulk += e.cost
        oldest = Math.min(oldest, e.at)
      }
      const over = used + cost > w.limit || (bulk && usedBulk + cost > w.bulkLimit)
      // A request bigger than a whole window is let through on an empty window.
      if (over && used > 0) return refusal('client request quota', oldest + w.ms - t)
    }
    this.log.push({ at: t, cost, bulk })
    return null
  }

  /** The provider answered 429: stop sending until it is expected to accept again. */
  rejected(retryAfterMs?: number): number {
    const wait = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : this.opts.cooldownMs
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + wait)
    return wait
  }
}

function refusal(message: string, retryAfterMs: number): SourceError {
  return {
    kind: 'rate_limited',
    message,
    retryable: true,
    retryAfterMs: Math.max(1_000, Math.ceil(retryAfterMs)),
  }
}

/** Retry-After header (seconds or HTTP date) in ms; undefined when absent or unparsable. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const s = Number(value)
  if (Number.isFinite(s)) return s >= 0 ? s * 1_000 : undefined
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - now)
}
