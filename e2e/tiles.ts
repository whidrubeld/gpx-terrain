import { crc32, deflateSync } from 'node:zlib'

import type { Page } from '@playwright/test'

const TILE_SIZE = 256

/** Minimal RGB8 PNG encoder. */
function encodePng(
  size: number,
  pixel: (x: number, y: number) => readonly [number, number, number]
): Buffer {
  const stride = size * 3 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * stride + 1 + x * 3)
  }
  const chunk = (type: string, data: Buffer) => {
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
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Terrarium encoding: `R*256 + G + B/256 - 32768` m. */
const terrarium = (meters: number) => {
  const value = Math.round((meters + 32768) * 256) / 256
  const integer = Math.floor(value)
  return [
    Math.floor(integer / 256),
    integer % 256,
    Math.round((value - integer) * 256)
  ] as const
}

/**
 * Serves synthetic tiles instead of AWS Terrain Tiles, EOX and OpenFreeMap:
 * rolling hills, plain gray imagery and no map features, so tests neither
 * depend on nor load the servers.
 */
export async function mockTileServers(page: Page) {
  const headers = { 'access-control-allow-origin': '*' }
  const elevation = new Map<string, Buffer>()
  await page.route('**/elevation-tiles-prod/terrarium/**', (route) => {
    const [x, y] = new URL(route.request().url()).pathname
      .replace(/\.png$/, '')
      .split('/')
      .slice(-2)
      .map(Number)
    const key = `${x}/${y}`
    let body = elevation.get(key)
    if (!body) {
      body = encodePng(TILE_SIZE, (px, py) => {
        const gx = x * TILE_SIZE + px
        const gy = y * TILE_SIZE + py
        return terrarium(1500 + 400 * Math.sin(gx / 90) * Math.cos(gy / 110))
      })
      elevation.set(key, body)
    }
    return route.fulfill({ contentType: 'image/png', headers, body })
  })
  const imagery = encodePng(TILE_SIZE, (x, y) =>
    (x >> 5) % 2 === (y >> 5) % 2 ? [120, 120, 120] : [150, 150, 150]
  )
  await page.route('https://tiles.maps.eox.at/**', (route) =>
    route.fulfill({ contentType: 'image/png', headers, body: imagery })
  )
  // the TileJSON names the tiles; an empty vector tile has no features
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.request().url().endsWith('.pbf')
      ? route.fulfill({
          contentType: 'application/vnd.mapbox-vector-tile',
          headers,
          body: Buffer.alloc(0)
        })
      : route.fulfill({
          contentType: 'application/json',
          headers,
          json: {
            tilejson: '3.0.0',
            tiles: ['https://tiles.openfreemap.org/planet/e2e/{z}/{x}/{y}.pbf']
          }
        })
  )
}
