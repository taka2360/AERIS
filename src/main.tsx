import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createMockProvider, mockOptionsFromUrl } from '@/providers/mock'
import { App } from './App'
import './styles/tokens.css'
import './styles/base.css'

// Live provider arrives with the real source adapters (steps 3–7).
const provider = createMockProvider(mockOptionsFromUrl(window.location.search))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App provider={provider} />
  </StrictMode>,
)
