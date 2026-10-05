/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  build: {
    // MapLibre (~1 MB raw, ~280 kB gzip) is a lazily loaded chunk by design.
    chunkSizeWarningLimit: 1100,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'relay/**/*.test.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
})
