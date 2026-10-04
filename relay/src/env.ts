/**
 * Worker bindings. Declared structurally so the relay type-checks without
 * @cloudflare/workers-types; only the members AERIS uses are listed.
 */
export interface KV {
  get(key: string, type: 'json'): Promise<unknown>
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>
}

/** Workers Rate Limiting binding (not available on Pages Functions). */
export interface RateLimiter {
  limit(opts: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  SNAPSHOTS: KV
  RATE_LIMITER?: RateLimiter
  /** NASA FIRMS MAP_KEY (secret) */
  FIRMS_MAP_KEY?: string
  /** Comma-separated origins allowed by CORS */
  ALLOWED_ORIGINS?: string
}

export interface ExecutionCtx {
  waitUntil(p: Promise<unknown>): void
}
