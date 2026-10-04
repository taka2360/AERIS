import { useState } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import type { WeatherProvider } from '@/services/provider'
import { createPersistOptions, createQueryClient } from '@/query/client'
import { LocationScope } from '@/query/location'
import { WeatherProviderScope } from '@/query/provider-context'
import { SelectionScope } from '@/query/selection'
import { TimeCursorScope } from '@/query/time-cursor'
import { Terminal } from '@/ui/shell/Terminal'

export function App({ provider }: { provider: WeatherProvider }) {
  const [client] = useState(createQueryClient)
  const [persistOptions] = useState(() => createPersistOptions(client, provider.id))
  return (
    <PersistQueryClientProvider client={client} persistOptions={persistOptions}>
      <WeatherProviderScope provider={provider}>
        <LocationScope>
          <TimeCursorScope>
            <SelectionScope>
              <Terminal />
            </SelectionScope>
          </TimeCursorScope>
        </LocationScope>
      </WeatherProviderScope>
    </PersistQueryClientProvider>
  )
}
