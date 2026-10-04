/**
 * Public-endpoint defences: route allowlist, GET only, CORS restricted to
 * AERIS origins, per-IP rate limit (Workers Rate Limiting binding).
 */
import type { Env } from './env'
import { RelayError } from './http'

export const ROUTES = ['/health', '/firms', '/nhc', '/hydro'] as const
export type Route = (typeof ROUTES)[number]

export function allowedOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get('origin')
  if (!origin) return null
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return allowed.includes(origin) ? origin : null
}

export function withCors(res: Response, origin: string | null): Response {
  if (!origin) return res
  const headers = new Headers(res.headers)
  headers.set('access-control-allow-origin', origin)
  headers.set('vary', 'origin')
  return new Response(res.body, { status: res.status, headers })
}

/** Throws RelayError when the request must be rejected; returns the route otherwise. */
export async function checkRequest(req: Request, env: Env): Promise<Route> {
  const url = new URL(req.url)
  const route = ROUTES.find((r) => r === url.pathname)
  if (!route) throw new RelayError('NOT_FOUND', 'unknown route')
  if (req.method !== 'GET') throw new RelayError('METHOD_NOT_ALLOWED', 'GET only')
  if (env.RATE_LIMITER) {
    const key = req.headers.get('cf-connecting-ip') ?? 'anonymous'
    const { success } = await env.RATE_LIMITER.limit({ key })
    if (!success) throw new RelayError('RATE_LIMITED', 'too many requests')
  }
  return route
}
