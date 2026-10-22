import { expect, test } from '@playwright/test'

import { mockTileServers } from './tiles'

const LOOP = `<?xml version="1.0"?>
<gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Morning loop</name></metadata>
  <trk><type>running</type><trkseg>
    <trkpt lat="46.5760" lon="7.9750"><time>2025-07-19T06:00:00Z</time></trkpt>
    <trkpt lat="46.5800" lon="7.9810"><time>2025-07-19T06:10:00Z</time></trkpt>
    <trkpt lat="46.5860" lon="7.9900"><time>2025-07-19T06:20:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`

const gpx = (name: string, text: string) => ({
  name,
  mimeType: 'application/gpx+xml',
  buffer: Buffer.from(text)
})

test.describe('language', () => {
  test.use({ locale: 'ru-RU' })

  test('follows the browser until the user picks one', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await expect(page.getByText('Перетащите сюда файл .gpx')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Ouchy – Sauvabelin/ })
    ).toContainText('Бег')

    await page.getByTitle('English').click()
    await expect(page.getByText('Drop a .gpx file here')).toBeVisible()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByText('Drop a .gpx file here')).toBeVisible()
  })
})

test('starts with the chooser, opens an example and changes it', async ({
  page
}) => {
  await mockTileServers(page)
  await page.goto('/')
  await expect(page).toHaveTitle(/^GPX Terrain/)
  await page.getByRole('button', { name: /Ouchy – Sauvabelin/ }).click()

  const title = page.getByRole('button', {
    name: 'Change track: Ouchy – Sauvabelin'
  })
  await expect(title).toBeVisible()
  await expect(page).toHaveTitle('Ouchy – Sauvabelin · GPX Terrain')
  // the grid around the route: two columns by three rows of tiles
  await expect(page.getByRole('contentinfo')).toContainText('2×3', {
    timeout: 60_000
  })
  await expect(page.getByRole('contentinfo')).toContainText('Img 6/6', {
    timeout: 60_000
  })

  await expect(page.getByText('Terrain ready')).toBeHidden()

  // the same chooser, over the track: Esc keeps the track
  await title.click()
  const dialog = page.getByRole('dialog', { name: 'Open a track' })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: /Choose file/ })
  ).toBeFocused()
  // …and nothing replays: no "Terrain ready" for the terrain already there
  const flashed = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const observer = new MutationObserver(() => {
          if (!document.body.textContent.includes('Terrain ready')) return
          observer.disconnect()
          resolve(true)
        })
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true
        })
        setTimeout(() => {
          observer.disconnect()
          resolve(false)
        }, 1500)
      })
  )
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(title).toBeVisible()
  expect(await flashed).toBe(false)

  await page.keyboard.press('KeyO')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /Bright Angel Trail/ }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Change track: Bright Angel Trail' })
  ).toBeVisible()
})

test('the intro reveals the waypoints, never showing them first', async ({
  page
}) => {
  await mockTileServers(page)
  // every waypoint label as it enters the page: hidden until the route passes
  await page.addInitScript(() => {
    const early: string[] = []
    Object.assign(window, { early })
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          const labels = [node, ...node.querySelectorAll('*')].filter(
            (element) =>
              element.matches('.scene-label[data-interactive="true"]')
          ) as HTMLElement[]
          for (const label of labels)
            if (label.dataset.visible === 'true') early.push(label.textContent)
        }
      }
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Ouchy – Sauvabelin/ }).click()
  await expect(
    page.locator('.scene-label[data-interactive="true"][data-visible="true"]')
  ).toHaveCount(6, { timeout: 60_000 })
  expect(
    await page.evaluate(() => (window as unknown as { early: string[] }).early)
  ).toEqual([])
})

test('opens a file, and keeps the track when the next one is broken', async ({
  page
}) => {
  await mockTileServers(page)
  await page.goto('/')
  const picker = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Choose file/ }).click()
  await (await picker).setFiles(gpx('loop.gpx', LOOP))
  const title = page.getByRole('button', { name: 'Change track: Morning loop' })
  await expect(title).toBeVisible()
  await expect(title).toContainText('loop.gpx')

  // ⌘O on Apple platforms, Ctrl+O elsewhere: the file dialog right away
  const next = page.waitForEvent('filechooser')
  await page.keyboard.press('ControlOrMeta+o')
  await (await next).setFiles(gpx('broken.gpx', '<gpx><trk>'))
  await expect(page.getByRole('alert')).toContainText('not valid XML')
  await expect(title).toBeVisible()
})

test.describe('touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('the help shows touch gestures only', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Controls' }).tap()
    const help = page.getByRole('dialog', { name: 'Controls' })
    await expect(help.getByRole('heading', { name: 'Touch' })).toBeVisible()
    await expect(help.getByText('Tap route')).toBeVisible()
    await expect(help.getByRole('heading', { name: 'Mouse' })).toHaveCount(0)
    await expect(help.getByRole('heading', { name: 'Keyboard' })).toHaveCount(0)
  })
})

test('the help shows mouse and keyboard controls only', async ({ page }) => {
  await page.goto('/')
  // the app is up and listening
  await expect(page.getByText('Drop a .gpx file here')).toBeVisible()
  await page.keyboard.press('KeyH')
  const help = page.getByRole('dialog', { name: 'Controls' })
  await expect(help.getByRole('heading', { name: 'Mouse' })).toBeVisible()
  await expect(help.getByRole('heading', { name: 'Keyboard' })).toBeVisible()
  await expect(help.getByText('Wireframe')).toBeVisible()
  await expect(help.getByRole('heading', { name: 'Touch' })).toHaveCount(0)
})

test('single-key shortcuts can be switched off', async ({ page }) => {
  await mockTileServers(page)
  await page.goto('/')
  await page.keyboard.press('Digit1')
  // lines first; W goes to the photo
  const wire = page.getByRole('radio', { name: 'Wire' })
  const photo = page.getByRole('radio', { name: 'Photo' })
  await expect(wire).toBeChecked()
  await page.keyboard.press('KeyW')
  await expect(photo).toBeChecked()

  // in the advanced settings, closed at first
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByText('Keyboard shortcuts', { exact: true }).click()
  await page.keyboard.press('KeyW')
  await expect(photo).toBeChecked()
  await expect(
    page.getByRole('switch', { name: /^Keyboard shortcuts/ })
  ).not.toBeChecked()
})

test('every style shows its own map features', async ({ page }) => {
  await mockTileServers(page)
  await page.goto('/')
  await page.keyboard.press('Digit1')
  // the inputs are visually hidden: click their labels
  const choose = (name: string) =>
    page.getByRole('radio', { name }).locator('xpath=..').click()
  const buildings = page.getByRole('switch', { name: /^Buildings/ })
  const roads = page.getByRole('switch', { name: /^Roads/ })

  // in lines everything; on the photo, only what it lacks
  await expect(roads).toBeChecked()
  await choose('Photo')
  await expect(buildings).toBeChecked()
  await expect(roads).not.toBeChecked()
  await choose('Model')
  await expect(roads).toBeChecked()
  await roads.locator('xpath=..').click()
  await choose('Photo')
  await expect(roads).not.toBeChecked()
  await choose('Model')
  await expect(roads).not.toBeChecked()
  await expect(buildings).toBeChecked()

  // C hides them all, and their switches with them
  await page.keyboard.press('KeyC')
  await expect(
    page.getByRole('switch', { name: /^Map features/ })
  ).not.toBeChecked()
  await expect(buildings).toBeHidden()
})
