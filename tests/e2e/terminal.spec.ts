import { CLOCK, expect, mockUrl, test, waitForTerminal } from '../fixtures'

// Boot tests keep the simulated latency: with none, the boot can finish
// (~0.2 s after the links settle) before the first assertion runs.
const bootUrl = `/?mock&clock=${encodeURIComponent(CLOCK)}`

test.describe('boot', () => {
  test.use({ skipBoot: false })

  test('shows a short boot sequence driven by real requests, then the terminal', async ({
    page,
  }) => {
    await page.goto(bootUrl)
    await expect(page.getByText('SYSTEM INITIALIZATION')).toBeVisible()
    await expect(page.getByText('SYSTEM INITIALIZATION')).toBeHidden({ timeout: 3_000 })
    await expect(page.getByRole('banner')).toContainText('ONLINE')
  })

  test('respects reduced motion (no line animation)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(bootUrl)
    const line = page.getByText('WEATHER DATA LINK')
    await expect(line).toBeVisible()
    const anim = await line.evaluate((el) => getComputedStyle(el.closest('li')!).animationName)
    expect(anim).toBe('none')
  })
})

test('shows observation-first current conditions and a separate JMA warning', async ({ page }) => {
  await page.goto(mockUrl())
  await waitForTerminal(page)
  const current = page.getByRole('region', { name: 'CURRENT ATMOSPHERIC STATUS' })
  await expect(current.getByText('OBS').first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'JMA WARNING SYSTEM' })).toContainText(
    '注意報 発表中',
  )
  await expect(page.getByRole('region', { name: 'AERIS STATUS' })).toContainText(
    '気象庁の警報・注意報ではありません',
  )
})

test('timeline cursor follows the pointer and the keyboard', async ({ page }) => {
  await page.goto(mockUrl())
  await waitForTerminal(page)
  const slider = page.getByRole('slider', { name: /時刻カーソル/ })
  const readout = page.getByLabel('カーソル位置の値')
  await expect(readout).toContainText('16:00')

  const box = (await slider.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.99, box.y + box.height / 2)
  await expect(readout).toContainText('T+24H')

  await slider.focus()
  await page.keyboard.press('Escape')
  await page.keyboard.press('PageDown')
  await expect(readout).toContainText('T+06H')
})

test('location search switches to a manual location', async ({ page }) => {
  await page.goto(mockUrl())
  await waitForTerminal(page)
  await page.keyboard.press('/')
  await page.getByRole('combobox', { name: '地名' }).fill('大阪')
  await page.getByRole('option', { name: /大阪/ }).first().waitFor()
  await page.keyboard.press('Enter')
  const banner = page.getByRole('banner')
  await expect(banner).toContainText('MANUAL')
  await expect(banner).toContainText('大阪府大阪市')
  await expect(banner).toContainText('34.69N 135.50E')
})

test('a failing source degrades the system without blanking other panels', async ({ page }) => {
  await page.goto(mockUrl('&fail=jma-warning'))
  await expect(page.getByRole('banner')).toContainText('DEGRADED')
  await expect(page.getByRole('region', { name: 'JMA WARNING SYSTEM' })).toContainText(
    'UNAVAILABLE',
  )
  await expect(
    page.getByRole('region', { name: 'CURRENT ATMOSPHERIC STATUS' }).getByText('OBS').first(),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'SYSTEM', exact: true })).toContainText(
    'JMA WARNING',
  )
})

test('all core sources down → OFFLINE, with nothing invented', async ({ page }) => {
  await page.goto(mockUrl('&fail=openmeteo,jma-amedas'))
  await expect(page.getByRole('banner')).toContainText('OFFLINE', { timeout: 10_000 })
  await expect(page.getByRole('region', { name: 'CURRENT ATMOSPHERIC STATUS' })).toContainText(
    '--.-',
  )
})

test('keyboard users can skip to content and use shortcuts', async ({ page }) => {
  await page.goto(mockUrl())
  await waitForTerminal(page)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'メインコンテンツへ移動' })).toBeFocused()
  await page.keyboard.press('Escape')
  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('/')
  await expect(page.getByRole('combobox', { name: '地名' })).toBeFocused()
})
