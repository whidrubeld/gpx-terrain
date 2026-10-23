import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'allow' })

interface Manifest {
  name: string
  display: string
  start_url: string
  icons: { purpose?: string }[]
  file_handlers: { accept: Record<string, string[]> }[]
}

test('is installable and starts offline', async ({ page, context }) => {
  await page.goto('/')

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]')
    if (!link) return null
    return (await fetch(link.href)).json() as Promise<Manifest>
  })
  expect(manifest).toMatchObject({
    name: 'GPX Terrain',
    display: 'standalone',
    start_url: './'
  })
  expect(manifest?.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  expect(manifest?.file_handlers[0].accept['application/gpx+xml']).toContain(
    '.gpx'
  )

  // the service worker precaches the app and takes control
  await expect
    .poll(
      () => page.evaluate(() => navigator.serviceWorker.controller !== null),
      {
        timeout: 30_000
      }
    )
    .toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'GPX Terrain', level: 1 })
  ).toBeVisible()
  // the example tracks are precached too
  await page.getByRole('button', { name: /Ouchy – Sauvabelin/ }).click()
  await expect(
    page.getByRole('button', { name: 'Change track: Ouchy – Sauvabelin' })
  ).toBeVisible()
  await expect(page.getByRole('contentinfo')).toContainText('Offline')
})
