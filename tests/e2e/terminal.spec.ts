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
    // Read the style in the same frame the line appears: the boot may end right after.
    const anim = await page.waitForFunction(() => {
      const li = [...document.querySelectorAll('li')].find((l) =>
        l.textContent?.includes('WEATHER DATA LINK'),
      )
      return li ? getComputedStyle(li).animationName : null
    })
    expect(await anim.jsonValue()).toBe('none')
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

  // The terminal is taller than the viewport; bring the timeline on screen first.
  await slider.scrollIntoViewIfNeeded()
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

test.describe('time cursor', () => {
  test.use({ scopeMode: 'map' })

  test('scrubbing pins every view to a past time until LIVE is pressed', async ({ page }) => {
    await page.goto(mockUrl())
    await waitForTerminal(page)
    const slider = page.getByRole('slider', { name: '地図の時刻' })
    await expect(page.getByText('LIVE へ戻る')).toHaveCount(0)
    await slider.focus()
    await page.keyboard.press('Home')
    const band = page.getByRole('status').filter({ hasText: 'SCRUB' })
    await expect(band).toContainText('T−')
    await expect(band).toContainText('(過去)')
    await band.getByRole('button', { name: 'LIVE へ戻る' }).click()
    await expect(page.getByText('LIVE へ戻る')).toHaveCount(0)
  })
})

test.describe('earthquake scenario', () => {
  test('a strong local quake reaches the band, the monitor and the detail panel', async ({
    page,
  }) => {
    await page.goto(mockUrl('&scenario=quake'))
    await waitForTerminal(page)
    const band = page.getByRole('status').filter({ hasText: 'EQ' })
    await expect(band).toContainText('監視地点付近で震度4を観測')
    const monitor = page.getByRole('region', { name: 'EVENT MONITOR' })
    await expect(monitor).toContainText('WARNING')
    await expect(monitor).toContainText('AERIS')
    await band.getByRole('button').click()
    const detail = page.getByRole('region', { name: 'EVENT DETAIL' })
    // Both agencies' magnitudes, each with its source.
    await expect(detail).toContainText('Mj 6.1')
    await expect(detail).toContainText('Mw 5.9')
    await expect(detail).toContainText('震度5強')
    await expect(detail).toContainText('AERIS 判定')
  })

  test('quiet scenario keeps the band clear of distant quakes', async ({ page }) => {
    await page.goto(mockUrl('&scenario=quiet'))
    await waitForTerminal(page)
    await expect(page.getByRole('status').filter({ hasText: 'EQ' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'EVENT LOG' })).toContainText('日向灘')
  })
})

test.describe('tsunami scenario', () => {
  test('the local coast advisory takes the top band and the monitor reports WARNING', async ({
    page,
  }) => {
    await page.goto(mockUrl('&scenario=tsunami'))
    await waitForTerminal(page)
    const band = page.getByRole('alert')
    await expect(band).toContainText('TSUNAMI ADVISORY')
    await expect(band).toContainText('東京湾内湾')
    await expect(band).toContainText('監視地点の沿岸')
    const monitor = page.getByRole('region', { name: 'EVENT MONITOR' })
    await expect(monitor.getByRole('listitem').first()).toContainText('TSUNAMI')
    await expect(monitor.getByRole('listitem').first()).toContainText('WARNING')
    await band.getByRole('button').click()
    const detail = page.getByRole('region', { name: 'EVENT DETAIL' })
    await expect(detail).toContainText('千葉県九十九里・外房')
    await expect(detail).toContainText('沿岸の観測値')
  })

  test('without bulletins the tsunami line reads NOMINAL', async ({ page }) => {
    await page.goto(mockUrl('&scenario=quiet'))
    await waitForTerminal(page)
    const row = page.getByRole('region', { name: 'EVENT MONITOR' }).getByRole('listitem').first()
    await expect(row).toContainText('TSUNAMI')
    await expect(row).toContainText('NOMINAL')
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})
