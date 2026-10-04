import { createContext, useContext, type ReactNode } from 'react'
import type { WeatherProvider } from '@/services/provider'

const ProviderContext = createContext<WeatherProvider | null>(null)

export function WeatherProviderScope({
  provider,
  children,
}: {
  provider: WeatherProvider
  children: ReactNode
}) {
  return <ProviderContext.Provider value={provider}>{children}</ProviderContext.Provider>
}

export function useWeatherProvider(): WeatherProvider {
  const p = useContext(ProviderContext)
  if (!p) throw new Error('WeatherProviderScope is missing')
  return p
}
