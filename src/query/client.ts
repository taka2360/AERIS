import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'
import { SourceFailure } from '@/domain/result'

/** Bump when persisted data shapes change; old caches are discarded. */
export const CACHE_SCHEMA_VERSION = 1
const CACHE_STORAGE_PREFIX = 'aeris.cache'

/** One cache per data provider — simulated data must never be restored as live (or vice versa). */
export const cacheStorageKey = (providerId: string) => `${CACHE_STORAGE_PREFIX}.${providerId}`
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: CACHE_MAX_AGE_MS,
        refetchOnWindowFocus: true,
        retry: (count, error) => {
          if (error instanceof SourceFailure && !error.detail.retryable) return false
          return count < 2
        },
        retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 15_000),
      },
    },
  })
}

/** localStorage may be unavailable (private mode, blocked site data). */
function safeStorage(): Storage | undefined {
  try {
    const k = '__aeris_probe__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return window.localStorage
  } catch {
    return undefined
  }
}

export function createPersistOptions(
  client: QueryClient,
  providerId: string,
): Omit<PersistQueryClientOptions, 'queryClient'> & { queryClient: QueryClient } {
  const persister = createSyncStoragePersister({
    storage: safeStorage(),
    key: cacheStorageKey(providerId),
    throttleTime: 2_000,
  })
  return {
    queryClient: client,
    persister,
    maxAge: CACHE_MAX_AGE_MS,
    buster: String(CACHE_SCHEMA_VERSION),
    dehydrateOptions: {
      // Only weather data marked persistable; never location lookups.
      shouldDehydrateQuery: (q) => q.meta?.persist === true && q.state.status === 'success',
    },
  }
}

export function clearPersistedCache(client: QueryClient): void {
  client.clear()
  try {
    // Every provider's cache, plus the pre-split legacy key.
    for (const k of Object.keys(window.localStorage)) {
      if (k === CACHE_STORAGE_PREFIX || k.startsWith(`${CACHE_STORAGE_PREFIX}.`)) {
        window.localStorage.removeItem(k)
      }
    }
  } catch {
    /* storage unavailable */
  }
}
