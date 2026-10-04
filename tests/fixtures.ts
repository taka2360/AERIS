import { test as base, type Page } from '@playwright/test'

export const CLOCK = '2026-10-04T16:24:00+09:00'

/** Mock provider, pinned clock, no simulated latency. */
export function mockUrl(extra = ''): string {
  return `/?mock&nolatency&clock=${encodeURIComponent(CLOCK)}${extra}`
}

type Options = { skipBoot: boolean; scopeMode: 'map' | 'scope' }

export const test = base.extend<Options>({
  skipBoot: [true, { option: true }],
  scopeMode: ['scope', { option: true }],
  page: async ({ page, skipBoot, scopeMode }, use) => {
    await page.addInitScript(
      ([skip, mode]) => {
        if (skip) window.sessionStorage.setItem('aeris.booted', '1')
        window.localStorage.setItem('aeris.scopeMode', mode as string)
      },
      [skipBoot, scopeMode] as const,
    )
    await use(page)
  },
})

export { expect } from '@playwright/test'

/** Wait until the core panels have data and web fonts are ready. */
export async function waitForTerminal(page: Page): Promise<void> {
  await page
    .getByRole('region', { name: 'CURRENT ATMOSPHERIC STATUS' })
    .getByText('OBS')
    .first()
    .waitFor()
  await page.getByRole('region', { name: 'JMA WARNING SYSTEM' }).getByText('雷注意報').waitFor()
  await page.evaluate(() => document.fonts.ready)
}
