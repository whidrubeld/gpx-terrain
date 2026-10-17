#!/usr/bin/env node
// Measures the vertical alignment of icons, text, rules and key hints inside
// UI rows from real pixels. For every atom of a row (svg icon, text run,
// .rule, .switch, .kbd box) it finds the ink in a screenshot and prints its
// center relative to the row's center, in CSS px (negative: above).
//
//   node .skills/verify-app/scripts/align.mjs [url] [dpr] [en|ru]
//
// Needs `yarn dev` (the stores on window.__viewer). Atoms of one row should
// agree within ~0.5 px; a word is centered on its capitals (baseline minus
// half the cap height), so breves and descenders do not count.

import { chromium } from '@playwright/test'

const [url = 'http://localhost:5173/', dpr = '2', lang = 'en'] =
  process.argv.slice(2)
const viewport = { width: 1280, height: 800 }

const WELCOME = [
  ['chooser header', 'section[aria-label] header', 1],
  ['toolbar buttons', '.btn'],
  ['example card heads', '.choice > span:first-child', 3]
]
const TRACK = [
  ['panel headers', 'section.panel > header'],
  ['top bar', 'header > button', 2],
  ['buttons', '.btn'],
  ['toggles', 'label.flex.h-6'],
  ['slider heads', 'label.grid > span.flex', 2],
  ['kbd', '.kbd']
]

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader']
})
const page = await browser.newPage({
  viewport,
  deviceScaleFactor: Number(dpr),
  locale: lang === 'ru' ? 'ru-RU' : 'en-US',
  colorScheme: 'dark'
})
await page.goto(url)
// a flat background: no dot grid, no glass, no scene
await page.addStyleTag({
  content:
    'body{background-image:none!important} .panel,.card,dialog{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'
})
await page.waitForTimeout(800)

async function measure(name, selector, max = 6) {
  const rows = await page.evaluate(
    ({ selector, max }) => {
      const visible = (el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return (
          r.width > 0 &&
          r.height > 0 &&
          cs.visibility !== 'hidden' &&
          cs.display !== 'none'
        )
      }
      // the inside of the nearest bordered box: its border is not ink
      const inside = (el, stop) => {
        for (let n = el; n && n !== stop.parentElement; n = n.parentElement) {
          const cs = getComputedStyle(n)
          const top = parseFloat(cs.borderTopWidth)
          const bottom = parseFloat(cs.borderBottomWidth)
          if (top > 0 && bottom > 0) {
            const r = n.getBoundingClientRect()
            return [r.top + top, r.bottom - bottom]
          }
        }
        return null
      }
      return [...document.querySelectorAll(selector)]
        .filter(visible)
        .slice(0, max)
        .map((container) => {
          const c = container.getBoundingClientRect()
          const atoms = []
          const walk = (n) => {
            if (n.nodeType === 3) {
              const text = n.textContent.trim()
              if (!text || /^[·×+→↗↓↑—–-]$/.test(text)) return
              const range = document.createRange()
              range.selectNodeContents(n)
              const r = range.getBoundingClientRect()
              const cs = getComputedStyle(n.parentElement)
              atoms.push({
                label: text.slice(0, 12),
                text: true,
                x0: r.left + 1,
                x1: r.right - 1,
                clip: inside(n.parentElement, container),
                size: parseFloat(cs.fontSize),
                cap: cs.fontFamily.includes('Doto') ? 0.7 : 0.73
              })
              return
            }
            if (n.nodeType !== 1 || !visible(n)) return
            const kind =
              n.tagName === 'svg'
                ? 'icon'
                : ['rule', 'switch', 'kbd'].find((c) => n.classList.contains(c))
            if (kind && n !== container) {
              const r = n.getBoundingClientRect()
              atoms.push({
                label: kind,
                x0: r.left,
                x1: r.right,
                // a key hint is measured by its own box, which may stick out
                clip:
                  kind === 'kbd'
                    ? [r.top, r.bottom]
                    : inside(n.parentElement, container)
              })
              if (kind !== 'kbd') return
            }
            for (const child of n.childNodes) walk(child)
          }
          for (const child of container.childNodes) walk(child)
          return { rect: [c.left, c.top, c.width, c.height], atoms }
        })
    },
    { selector, max }
  )

  console.log(`${name} (${selector})`)
  for (const { rect, atoms } of rows) {
    const [left, top, width, height] = rect
    // a margin around the row: boxes like .kbd may stick out of it
    const clip = {
      x: Math.max(0, Math.floor(left)),
      y: Math.max(0, Math.floor(top) - 4),
      width: Math.ceil(width) + 1,
      height: Math.ceil(height) + 9
    }
    clip.width = Math.min(clip.width, viewport.width - clip.x)
    clip.height = Math.min(clip.height, viewport.height - clip.y)
    if (clip.width <= 0 || clip.height <= 0) continue
    const png = await page.screenshot({ clip, animations: 'disabled' })
    const result = await page.evaluate(
      async ({ data, clip, atoms, dpr, center, row }) => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(image, 0, 0)
        const { data: px, width } = ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        )
        const at = (x, y) => {
          const i = (y * width + x) * 4
          return [px[i], px[i + 1], px[i + 2]]
        }
        return atoms.map((a) => {
          const x0 = Math.max(0, Math.round((a.x0 - clip.x) * dpr))
          const x1 = Math.min(
            canvas.width - 1,
            Math.round((a.x1 - clip.x) * dpr)
          )
          // the row itself, or the box the atom is drawn in
          const [from, to] = a.clip ?? row
          const y0 = Math.max(0, Math.round((from - clip.y) * dpr))
          const y1 = Math.min(
            canvas.height - 1,
            Math.round((to - clip.y) * dpr) - 1
          )
          // background: the most common color of the region
          const counts = new Map()
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
              const key = at(x, y).join()
              counts.set(key, (counts.get(key) ?? 0) + 1)
            }
          const bg = [...counts]
            .sort((p, q) => q[1] - p[1])[0][0]
            .split(',')
            .map(Number)
          const ink = []
          for (let y = y0; y <= y1; y++) {
            let n = 0
            for (let x = x0; x <= x1; x++) {
              const p = at(x, y)
              if (
                Math.abs(p[0] - bg[0]) +
                  Math.abs(p[1] - bg[1]) +
                  Math.abs(p[2] - bg[2]) >
                90
              )
                n++
            }
            ink.push(n)
          }
          const rows = ink.flatMap((n, i) => (n ? [i] : []))
          if (!rows.length) return `${a.label}:—`
          const top = clip.y + (y0 + rows[0]) / dpr
          const bottom = clip.y + (y0 + rows[rows.length - 1] + 1) / dpr
          let mid = (top + bottom) / 2
          if (a.text && a.label.length > 2) {
            // the baseline: the last row most letters reach
            const peak = Math.max(...ink)
            let base = 0
            ink.forEach((n, i) => {
              if (n >= peak * 0.35) base = i
            })
            mid = clip.y + (y0 + base + 1) / dpr - (a.size * a.cap) / 2
          }
          return `${a.label}:${(mid - center).toFixed(2)}`
        })
      },
      {
        data: png.toString('base64'),
        clip,
        atoms,
        dpr: Number(dpr),
        center: top + height / 2,
        row: [top, top + height]
      }
    )
    console.log(`  h${Math.round(height)}  ${result.join('  ')}`)
  }
}

for (const [name, selector, max] of WELCOME) await measure(name, selector, max)

await page.keyboard.press('Digit1')
await page.waitForFunction(
  () => window.__viewer?.terrainStore.state.drape,
  null,
  {
    timeout: 90_000
  }
)
await page.waitForTimeout(6000)
await page.addStyleTag({ content: '.scene{visibility:hidden!important}' })
for (const [name, selector, max] of TRACK) await measure(name, selector, max)

await page.keyboard.press('Slash')
await page.waitForTimeout(400)
await measure('help header', 'dialog[open] header', 1)
await browser.close()
