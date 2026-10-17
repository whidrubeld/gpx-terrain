#!/usr/bin/env node
// Draws the app icons in public/icons/ from the pixel logo (the same grid as
// `logo` in src/ui/Icon.tsx and public/favicon.svg): light pixels on the dark
// dot-matrix background of the app.
//
// Usage: node scripts/make-icons.mjs   (deterministic, no dependencies)

import { mkdir, writeFile } from 'node:fs/promises'
import { crc32, deflateSync } from 'node:zlib'

const OUT = new URL('../public/icons/', import.meta.url)

const LOGO = [
  '......#......',
  '.....###.....',
  '....##.##....',
  '...##...##...',
  '..##.#.#.##..',
  '.##.......##.',
  '#############'
]

const BACKGROUND = [0x0a, 0x0a, 0x0a]
const DOT = [0x26, 0x26, 0x26]
const INK = [0xf4, 0xf4, 0xf4]

/** RGB8 PNG. */
function encodePng(size, pixel) {
  const stride = size * 3 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * stride + 1 + x * 3)
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/**
 * @param size icon size, px
 * @param width share of the icon the logo spans: maskable icons keep it in
 *   the safe zone (the central circle of 80 % diameter)
 */
function icon(size, width) {
  const cols = LOGO[0].length
  const rows = LOGO.length
  const cell = Math.max(1, Math.floor((size * width) / cols))
  const left = Math.floor((size - cols * cell) / 2)
  // optically centered: the mass of the mountain sits low
  const top = Math.floor((size - rows * cell) / 2 - cell * 0.5)
  const pitch = Math.max(4, Math.round(cell / 2))
  const dot = Math.max(1, Math.round(pitch / 6))
  return encodePng(size, (x, y) => {
    const cx = Math.floor((x - left) / cell)
    const cy = Math.floor((y - top) / cell)
    if (x >= left && y >= top && LOGO[cy]?.[cx] === '#') return INK
    return x % pitch < dot && y % pitch < dot ? DOT : BACKGROUND
  })
}

const ICONS = [
  ['icon-192.png', 192, 0.62],
  ['icon-512.png', 512, 0.62],
  ['maskable-512.png', 512, 0.5],
  ['apple-touch-icon.png', 180, 0.58]
]

await mkdir(OUT, { recursive: true })
for (const [name, size, width] of ICONS) {
  const png = icon(size, width)
  await writeFile(new URL(name, OUT), png)
  console.log(`${name}  ${size}×${size}  ${png.length} B`)
}
