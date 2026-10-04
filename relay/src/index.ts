/**
 * AERIS relay — a dedicated Cloudflare Worker for sources the browser cannot
 * reach directly (no CORS, or a key that must stay secret).
 *
 *   GET /firms   NASA FIRMS detections (served from the cron snapshot)
 *   GET /nhc     NOAA NHC active storms (served from the cron snapshot)
 *   GET /hydro   reserved; NOT_AVAILABLE until the upstream's terms allow redistribution
 *   GET /health  snapshot ages
 *
 * Upstream quotas are protected structurally: upstreams are called only by
 * the scheduled handler, never per request.
 */
import type { Env, ExecutionCtx } from './env'
import { allowedOrigin, checkRequest, withCors } from './guard'
import { errorResponse, json, RelayError } from './http'
import { handleFirms, refreshFirms, type FirmsSnapshot } from './routes/firms'
import { handleNhc, refreshNhc, type NhcSnapshot } from './routes/nhc'

async function route(req: Request, env: Env): Promise<Response> {
  const path = await checkRequest(req, env)
  const url = new URL(req.url)
  switch (path) {
    case '/firms':
      return handleFirms(url, env)
    case '/nhc':
      return handleNhc(env)
    case '/hydro':
      throw new RelayError('NOT_AVAILABLE', 'river gauge relay is not enabled')
    case '/health': {
      const firms = (await env.SNAPSHOTS.get('firms:world', 'json')) as FirmsSnapshot | null
      const nhc = (await env.SNAPSHOTS.get('nhc:current', 'json')) as NhcSnapshot | null
      return json({
        firms: { configured: !!env.FIRMS_MAP_KEY, fetchedAt: firms?.fetchedAt ?? null },
        nhc: { fetchedAt: nhc?.fetchedAt ?? null },
      })
    }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(req, env)
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: origin ? 204 : 403,
        headers: origin
          ? {
              'access-control-allow-origin': origin,
              'access-control-allow-methods': 'GET',
              'access-control-max-age': '86400',
              vary: 'origin',
            }
          : {},
      })
    }
    let res: Response
    try {
      res = await route(req, env)
    } catch (e) {
      res = errorResponse(e)
    }
    return withCors(res, origin)
  },

  /** Cron trigger: refresh every snapshot independently. */
  async scheduled(_event: unknown, env: Env, ctx: ExecutionCtx): Promise<void> {
    const jobs: Promise<unknown>[] = [refreshNhc(env)]
    if (env.FIRMS_MAP_KEY) jobs.push(refreshFirms(env))
    ctx.waitUntil(Promise.allSettled(jobs))
  },
}
