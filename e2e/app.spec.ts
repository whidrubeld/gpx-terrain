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
      page.getByRole('button', { name: /Eiger Trail/ })
    ).toContainText('Пеший поход')

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
  await page.getByRole('button', { name: /Eiger Trail/ }).click()

  const title = page.getByRole('button', { name: 'Change track: Eiger Trail' })
  await expect(title).toBeVisible()
  await expect(page).toHaveTitle('Eiger Trail · GPX Terrain')
  await expect(page.getByRole('contentinfo')).toContainText('Img 9/9', {
    timeout: 60_000
  })

  // the same chooser, over the track: Esc keeps the track
  await title.click()
  const dialog = page.getByRole('dialog', { name: 'Open a track' })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: /Choose file/ })
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(title).toBeVisible()

  await page.keyboard.press('KeyO')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /Bright Angel Trail/ }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Change track: Bright Angel Trail' })
  ).toBeVisible()
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

test('single-key shortcuts can be switched off', async ({ page }) => {
  await mockTileServers(page)
  await page.goto('/')
  await page.keyboard.press('Digit1')
  const wireframe = page.getByRole('switch', { name: /^Wireframe/ })
  await expect(wireframe).not.toBeChecked()
  await page.keyboard.press('KeyW')
  await expect(wireframe).toBeChecked()

  await page.getByText('Keyboard shortcuts', { exact: true }).click()
  await page.keyboard.press('KeyW')
  await expect(wireframe).toBeChecked()
  await expect(
    page.getByRole('switch', { name: /^Keyboard shortcuts/ })
  ).not.toBeChecked()
})
