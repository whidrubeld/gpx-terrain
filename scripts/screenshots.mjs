#!/usr/bin/env node
// Renders the README screenshots in docs/ from the running dev server, with
// real tiles: `yarn dev`, then `yarn screenshots [scene …]`.
// Uses the installed Google Chrome, which renders on the GPU even headless
// (Playwright's own Chromium falls back to software WebGL: the performance
// panel would show a few FPS). Needs `cwebp` (libwebp) on PATH.

import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = new URL('../docs/', import.meta.url).pathname

/** Each scene: a viewport, stored settings, a track and what to point at. */
const SCENES = [
  {
    name: 'hero',
    viewport: [1280, 800, 2],
    settings: { theme: 'dark', language: 'en', wireframe: true, segments: 64 },
    panels: { view: false },
    preset: 'stelvio',
    hover: 0.6
  },
  {
    name: 'welcome',
    viewport: [1280, 800, 2],
    settings: { theme: 'light', language: 'en' }
  },
  {
    name: 'mono-light-ru',
    viewport: [1280, 800, 2],
    settings: { theme: 'light', language: 'ru', imagery: 'mono' },
    panels: { perf: false },
    preset: 'bright-angel',
    progress: 0.55
  },
  {
    name: 'mobile',
    viewport: [390, 844, 3],
    settings: { theme: 'dark', language: 'en' },
    preset: 'bright-angel',
    progress: 0.45
  }
]

const only = process.argv.slice(2)
const work = await mkdtemp(join(tmpdir(), 'gpx-terrain-screenshots-'))
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => {
  console.warn('Google Chrome not found: software rendering')
  return chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
})

for (const scene of SCENES) {
  if (only.length && !only.includes(scene.name)) continue
  const [width, height, deviceScaleFactor] = scene.viewport
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor,
    serviceWorkers: 'block'
  })
  await context.addInitScript(
    ({ settings, panels }) => {
      const stored = { animations: true, ...settings }
      if (panels) {
        stored.panels = {
          track: true,
          view: true,
          legend: true,
          perf: true,
          profile: true,
          ...panels
        }
      }
      localStorage.setItem('gpx-terrain/settings@1', JSON.stringify(stored))
      localStorage.setItem('gpx-terrain/hint-seen', '1')
    },
    { settings: scene.settings, panels: scene.panels }
  )
  const page = await context.newPage()
  await page.goto(BASE)
  // the stores are exposed in development builds only
  await page.waitForFunction(() => window.__viewer !== undefined)

  if (scene.preset) {
    await page.evaluate((id) => window.__viewer.loadPreset(id), scene.preset)
    await page.waitForFunction(
      () => {
        const s = window.__viewer.terrainStore.state
        return s.drape && s.total > 0 && s.textured >= s.total
      },
      null,
      { timeout: 120_000 }
    )
    // the intro: relief rises, the camera flies, the route draws
    await page.waitForTimeout(5000)
    await page.evaluate(({ hover, progress }) => {
      const v = window.__viewer
      const track = v.viewerStore.state.track
      if (hover !== undefined)
        v.setHoverIndex(Math.round((track.points.length - 1) * hover))
      if (progress !== undefined) v.seek(progress)
    }, scene)
    await page.waitForTimeout(1500)
  } else {
    await page.waitForTimeout(1500)
  }

  const png = join(work, `${scene.name}.png`)
  await page.screenshot({ path: png, animations: 'disabled' })
  const webp = join(OUT, `${scene.name}.webp`)
  execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', png, '-o', webp])
  console.log(webp)
  await context.close()
}

await browser.close()
await rm(work, { recursive: true })
