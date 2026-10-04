/**
 * Visual regression: the terminal itself is the product, so layout breakage
 * (A-01 / M-01 / W-01 / T-01 / D-01 …) is checked per breakpoint.
 * Deterministic: mock data, pinned clock, vector scope (no map tiles),
 * animations disabled. The only wall-clock value is masked.
 */
import { expect, mockUrl, test, waitForTerminal } from '../fixtures'

test('terminal layout', async ({ page }) => {
  await page.goto(mockUrl())
  await waitForTerminal(page)
  await expect(page).toHaveScreenshot('terminal.png', {
    fullPage: true,
    mask: [page.getByTestId('last-update')],
  })
})

test('degraded state layout', async ({ page }) => {
  await page.goto(mockUrl('&fail=jma-warning,openmeteo'))
  await expect(page.getByRole('banner')).toContainText('DEGRADED')
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('terminal-degraded.png', {
    mask: [page.getByTestId('last-update')],
  })
})

test('tsunami scenario layout', async ({ page }) => {
  await page.goto(mockUrl('&scenario=tsunami'))
  await expect(page.getByRole('alert')).toContainText('TSUNAMI')
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('terminal-tsunami.png', {
    mask: [page.getByTestId('last-update')],
  })
})
