import { defineConfig, devices } from '@playwright/test'

/**
 * E2E + visual regression. Everything runs on the mock provider with a pinned
 * clock and no network dependency, so CI never fails because an API is down.
 * Live-API smoke checks are manual (pnpm dev) or scheduled, not part of CI.
 */
const PORT = 5320

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Baselines are OS-specific (font rasterisation). Generate them in the
  // Playwright Docker image for CI: see README "Visual regression".
  snapshotPathTemplate:
    '{testDir}/{testFileDir}/__screenshots__/{arg}-{projectName}-{platform}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'e2e-desktop',
      testMatch: /e2e\/.*\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    { name: 'e2e-mobile', testMatch: /e2e\/mobile\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    ...[
      { name: 'vrt-390', width: 390, height: 844 },
      { name: 'vrt-768', width: 768, height: 1024 },
      { name: 'vrt-1280', width: 1280, height: 800 },
      { name: 'vrt-1440', width: 1440, height: 900 },
      { name: 'vrt-1920', width: 1920, height: 1080 },
    ].map(({ name, width, height }) => ({
      name,
      testMatch: /visual\/.*\.spec\.ts/,
      use: { viewport: { width, height }, deviceScaleFactor: 1 },
    })),
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
