import { expect, mockUrl, test, waitForTerminal } from '../fixtures'

test('handheld mode shows one view at a time and never scrolls sideways', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 767, 'mobile layout only')
  await page.goto(mockUrl())
  await waitForTerminal(page)

  const nav = page.getByRole('navigation', { name: '表示切替' })
  await expect(nav).toBeVisible()
  await expect(page.getByRole('region', { name: 'CURRENT ATMOSPHERIC STATUS' })).toBeVisible()
  await expect(page.getByRole('region', { name: '24H ATMOSPHERIC TIMELINE' })).toBeHidden()

  await nav.getByRole('button', { name: 'TIMELINE' }).click()
  await expect(page.getByRole('region', { name: '24H ATMOSPHERIC TIMELINE' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'CURRENT ATMOSPHERIC STATUS' })).toBeHidden()

  await nav.getByRole('button', { name: 'SCOPE' }).click()
  await expect(page.getByRole('region', { name: 'SPATIAL SCOPE' })).toBeVisible()

  for (const view of ['STATUS', 'TIMELINE', 'SCOPE', 'OUTLOOK', 'SYS']) {
    await nav.getByRole('button', { name: view }).click()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, `horizontal overflow in ${view}`).toBeLessThanOrEqual(0)
  }
})
