import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createLiveProvider } from '@/providers/live'
import { createMockProvider, mockOptionsFromUrl } from '@/providers/mock'
import { App } from './App'
import './styles/tokens.css'
import './styles/base.css'

// Live data by default; `?mock` (or VITE_DATA_MODE=mock) switches to the simulator.
const params = new URLSearchParams(window.location.search)
const useMock = params.has('mock') || import.meta.env.VITE_DATA_MODE === 'mock'
const provider = useMock
  ? createMockProvider(mockOptionsFromUrl(window.location.search))
  : createLiveProvider()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App provider={provider} />
  </StrictMode>,
)
