#!/usr/bin/env node
// Builds the demo GPX files in public/presets/ from open data:
//
// - route geometry: OpenStreetMap (Overpass API), © OpenStreetMap
//   contributors, ODbL — the shortest path through the ways of each route, or
//   through the streets of a city by way of a few places
// - elevations: AWS Terrain Tiles (terrarium, zoom 14), the same DEM the map uses
// - timestamps: synthesized — Tobler's hiking function for hikes, a constant
//   power model for rides, Minetti's energy cost of running for runs — with
//   GPS jitter and a few rest stops. These are not real recordings; every file
//   says so in its metadata.
//
// Usage: node scripts/make-presets.mjs [preset id …]
// Downloads are cached in scripts/.cache/ (git-ignored). Output is deterministic.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

const ROOT = new URL('..', import.meta.url)
const CACHE = new URL('scripts/.cache/', ROOT)
const OUT = new URL('public/presets/', ROOT)
const USER_AGENT =
  'gpx-terrain-presets/1.0 (+https://github.com/whidrubeld/gpx-terrain)'

/** @typedef {{ lat: number, lon: number }} LatLon */

const PRESETS = [
  {
    id: 'lausanne',
    name: 'Ouchy – Sauvabelin',
    desc: 'A city run from the lake at Ouchy up the old town and its covered stairs, past the cathedral, to the lake in the Sauvabelin woods, Lausanne, Switzerland.',
    type: 'running',
    link: {
      href: 'https://www.openstreetmap.org/#map=15/46.5220/6.6340',
      text: 'OpenStreetMap: Lausanne'
    },
    // the streets, footways and stairs; bridges and tunnels left out, since
    // the track is draped on the terrain
    query:
      'way["highway"~"^(footway|pedestrian|steps|path|living_street|residential|service|unclassified|tertiary|secondary|primary|cycleway|track)$"]["access"!~"^(private|no)$"]["bridge"!~"."]["tunnel"!~"."]["indoor"!~"."](46.503,6.618,46.542,6.648)',
    from: { name: 'Ouchy', lat: 46.5068, lon: 6.6268 },
    // the places on the way, and its waypoints: OpenStreetMap elements
    via: [
      {
        osm: 'node/1800313662',
        name: 'Lausanne station',
        label: 'Station',
        sym: 'Ground Transportation'
      },
      { osm: 'way/520103359', label: 'Square', sym: 'Crossing' },
      { osm: 'way/23395578', label: 'Covered stairs', sym: 'Scenic Area' },
      { osm: 'way/25718547', label: 'Cathedral', sym: 'Church' },
      { osm: 'way/46834980', label: 'Museum', sym: 'Museum' },
      { osm: 'way/46828008', label: 'Viewing tower', sym: 'Tall Tower' }
    ],
    to: { osm: 'relation/368167', label: 'Lake' },
    waypoints: 'via',
    start: '2025-09-14T05:50:00Z',
    interval: 2,
    model: 'run',
    speed: 3.2,
    stops: [{ at: 0.48, minutes: 2 }]
  },
  {
    id: 'stelvio',
    name: 'Passo dello Stelvio',
    desc: 'The eastern ramp of the Stelvio Pass road from Prato allo Stelvio: 48 hairpins up to 2757 m, South Tyrol, Italy.',
    type: 'cycling',
    osm: { type: 'relation', id: 15523244 },
    query: 'relation(15523244);way(r)',
    from: { name: 'Prato allo Stelvio', lat: 46.6195, lon: 10.5905 },
    to: 'highest',
    toName: 'Passo dello Stelvio',
    start: '2025-08-23T05:40:00Z',
    interval: 3,
    model: 'ride',
    power: 235,
    stops: [{ at: 0.47, minutes: 5 }]
  },
  {
    id: 'bright-angel',
    name: 'Bright Angel Trail',
    desc: 'From the South Rim trailhead down to the Colorado River, Grand Canyon, Arizona, USA.',
    type: 'hiking',
    osm: { type: 'way', id: 1181890945 },
    query:
      'way["highway"]["name"="Bright Angel Trail"](35.95,-112.25,36.15,-112.05)',
    from: { name: 'Bright Angel Trailhead', lat: 36.0575, lon: -112.1437 },
    to: { name: 'Colorado River', lat: 36.0984, lon: -112.1102 },
    start: '2025-04-12T13:05:00Z',
    interval: 6,
    model: 'hike',
    pace: 0.88,
    stops: [
      { at: 0.3, minutes: 9 },
      { at: 0.62, minutes: 22 }
    ]
  }
]

// ---------------------------------------------------------------- utilities

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Deterministic PRNG (mulberry32). */
function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(text) {
  let h = 2166136261
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619)
  return h >>> 0
}

/** Smooth noise: a damped random walk in [-1, 1]. */
function walker(rand, damping = 0.92) {
  let value = 0
  return () => {
    value = value * damping + (rand() * 2 - 1) * (1 - damping) * 2.2
    return Math.max(-1, Math.min(1, value))
  }
}

const R = 6371008.8
const toRad = (deg) => (deg * Math.PI) / 180

function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Moves `meters` east and north of `p`. */
function offset(p, east, north) {
  return {
    lat: p.lat + (north / R) * (180 / Math.PI),
    lon: p.lon + (east / (R * Math.cos(toRad(p.lat)))) * (180 / Math.PI)
  }
}

async function cached(name, load) {
  const file = new URL(name, CACHE)
  try {
    return await readFile(file)
  } catch {
    const data = await load()
    await mkdir(new URL('.', file), { recursive: true })
    await writeFile(file, data)
    return data
  }
}

// ---------------------------------------------------------------- Overpass

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
]

async function overpass(query) {
  const body = `[out:json][timeout:120];${query}`
  const data = await cached(
    `overpass-${hash(body).toString(16)}.json`,
    async () => {
      for (let attempt = 0; attempt < 12; attempt++) {
        const url = OVERPASS[attempt % OVERPASS.length]
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'User-Agent': USER_AGENT,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `data=${encodeURIComponent(body)}`
          })
          const text = await response.text()
          if (response.ok && text.trimStart().startsWith('{')) return text
          console.warn(`  overpass ${response.status} from ${url}, retrying`)
        } catch (error) {
          console.warn(`  overpass ${error.message} from ${url}, retrying`)
        }
        await sleep(2500 * (attempt + 1))
      }
      throw new Error('Overpass API unavailable')
    }
  )
  return JSON.parse(data.toString())
}

// ---------------------------------------------------------------- elevation

const DEM_ZOOM = 14

/** Minimal PNG decoder (8-bit, non-interlaced, gray/RGB/RGBA). */
function decodePng(buffer) {
  let position = 8
  let width = 0
  let height = 0
  let channels = 0
  const chunks = []
  while (position < buffer.length) {
    const length = buffer.readUInt32BE(position)
    const type = buffer.toString('ascii', position + 4, position + 8)
    const data = buffer.subarray(position + 8, position + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const [bitDepth, colorType, , , interlace] = data.subarray(8, 13)
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
      if (bitDepth !== 8 || interlace !== 0 || !channels) {
        throw new Error(
          `Unsupported PNG (depth ${bitDepth}, type ${colorType})`
        )
      }
    } else if (type === 'IDAT') chunks.push(data)
    else if (type === 'IEND') break
    position += 12 + length
  }

  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = y * (stride + 1) + 1
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[row + x - channels] : 0
      const b = y > 0 ? pixels[row - stride + x] : 0
      const c = x >= channels && y > 0 ? pixels[row - stride + x - channels] : 0
      let value = raw[line + x]
      if (filter === 1) value += a
      else if (filter === 2) value += b
      else if (filter === 3) value += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      pixels[row + x] = value & 255
    }
  }
  return { width, height, channels, pixels }
}

const demTiles = new Map()

/** Runs at most 6 downloads at a time. */
let running = 0
const queue = []
async function limited(task) {
  if (running >= 6) await new Promise((resolve) => queue.push(resolve))
  running++
  try {
    return await task()
  } finally {
    running--
    queue.shift()?.()
  }
}

async function demTile(x, y) {
  const key = `${x}/${y}`
  if (!demTiles.has(key)) {
    demTiles.set(
      key,
      (async () => {
        const png = await cached(`terrarium-${DEM_ZOOM}-${x}-${y}.png`, () =>
          limited(async () => {
            const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_ZOOM}/${x}/${y}.png`
            for (let attempt = 1; ; attempt++) {
              try {
                const response = await fetch(url, {
                  headers: { 'User-Agent': USER_AGENT },
                  signal: AbortSignal.timeout(30_000)
                })
                if (!response.ok) throw new Error(`${url}: ${response.status}`)
                return Buffer.from(await response.arrayBuffer())
              } catch (error) {
                if (attempt >= 5) throw error
                await sleep(1000 * attempt)
              }
            }
          })
        )
        const { width, height, channels, pixels } = decodePng(png)
        const meters = new Float32Array(width * height)
        for (let i = 0; i < meters.length; i++) {
          const p = i * channels
          meters[i] =
            pixels[p] * 256 + pixels[p + 1] + pixels[p + 2] / 256 - 32768
        }
        return { width, height, meters }
      })()
    )
  }
  return demTiles.get(key)
}

function tileFraction({ lat, lon }, zoom) {
  const n = 2 ** zoom
  const sin = Math.sin(toRad(lat))
  return {
    x: n * (lon / 360 + 0.5),
    y: n * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI))
  }
}

/** Bilinear DEM elevation in meters. */
async function elevation(point) {
  const f = tileFraction(point, DEM_ZOOM)
  const tx = Math.floor(f.x)
  const ty = Math.floor(f.y)
  const { width, height, meters } = await demTile(tx, ty)
  const px = Math.min(Math.max((f.x - tx) * width - 0.5, 0), width - 1.001)
  const py = Math.min(Math.max((f.y - ty) * height - 0.5, 0), height - 1.001)
  const x0 = Math.floor(px)
  const y0 = Math.floor(py)
  const fx = px - x0
  const fy = py - y0
  const at = (x, y) => meters[y * width + x]
  return (
    at(x0, y0) * (1 - fx) * (1 - fy) +
    at(x0 + 1, y0) * fx * (1 - fy) +
    at(x0, y0 + 1) * (1 - fx) * fy +
    at(x0 + 1, y0 + 1) * fx * fy
  )
}

// ---------------------------------------------------------------- geometry

/** Graph of every OSM node of the ways; edges follow the ways. */
function buildGraph(ways) {
  const nodes = new Map()
  const node = (id, point) => {
    if (!nodes.has(id)) nodes.set(id, { id, ...point, edges: [] })
    return nodes.get(id)
  }
  for (const way of ways) {
    const ids = way.nodes ?? way.geometry.map((p) => `${p.lat},${p.lon}`)
    for (let i = 1; i < way.geometry.length; i++) {
      const a = node(ids[i - 1], way.geometry[i - 1])
      const b = node(ids[i], way.geometry[i])
      const length = haversine(a, b)
      a.edges.push({ to: b, length })
      b.edges.push({ to: a, length })
    }
  }
  const all = [...nodes.values()]
  bridgeGaps(all, 80)
  return all
}

/** Route relations often have small gaps: link dead ends to nearby other parts. */
function bridgeGaps(nodes, maxGap) {
  const component = new Map()
  for (const start of nodes) {
    if (component.has(start)) continue
    const stack = [start]
    component.set(start, start)
    while (stack.length) {
      for (const { to } of stack.pop().edges) {
        if (component.has(to)) continue
        component.set(to, start)
        stack.push(to)
      }
    }
  }
  for (const end of nodes.filter((node) => node.edges.length === 1)) {
    const others = nodes.filter(
      (node) => component.get(node) !== component.get(end)
    )
    if (!others.length) continue
    const target = nearest(others, end)
    const length = haversine(end, target)
    if (length > maxGap) continue
    end.edges.push({ to: target, length })
    target.edges.push({ to: end, length })
  }
}

function nearest(nodes, point) {
  let best = nodes[0]
  let bestDistance = Infinity
  for (const node of nodes) {
    const distance = haversine(node, point)
    if (distance < bestDistance) {
      best = node
      bestDistance = distance
    }
  }
  return best
}

/** A binary min-heap of `[priority, value]`. */
class Heap {
  items = []
  get size() {
    return this.items.length
  }
  push(priority, value) {
    const { items } = this
    items.push([priority, value])
    for (let i = items.length - 1; i > 0;) {
      const parent = (i - 1) >> 1
      if (items[parent][0] <= items[i][0]) break
      ;[items[parent], items[i]] = [items[i], items[parent]]
      i = parent
    }
  }
  pop() {
    const { items } = this
    const top = items[0]
    const last = items.pop()
    if (items.length) {
      items[0] = last
      for (let i = 0; ;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < items.length && items[l][0] < items[m][0]) m = l
        if (r < items.length && items[r][0] < items[m][0]) m = r
        if (m === i) break
        ;[items[m], items[i]] = [items[i], items[m]]
        i = m
      }
    }
    return top
  }
}

function shortestPath(nodes, from, to) {
  const distance = new Map([[from, 0]])
  const previous = new Map()
  const open = new Heap()
  open.push(0, from)
  while (open.size) {
    const [best, current] = open.pop()
    if (best > distance.get(current)) continue // a stale entry
    if (current === to) break
    for (const { to: next, length } of current.edges) {
      const d = best + length
      if (d < (distance.get(next) ?? Infinity)) {
        distance.set(next, d)
        previous.set(next, current)
        open.push(d, next)
      }
    }
  }
  if (!previous.has(to) && from !== to)
    throw new Error('Route is not connected')
  const path = [to]
  while (path[0] !== from) path.unshift(previous.get(path[0]))
  return path.map(({ lat, lon }) => ({ lat, lon }))
}

/** Splits segments so that no two consecutive points are more than `step` m apart. */
function densify(points, step) {
  const result = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const parts = Math.ceil(haversine(a, b) / step)
    for (let k = 1; k <= parts; k++) {
      const t = k / parts
      result.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t
      })
    }
  }
  return result
}

// ---------------------------------------------------------------- motion

/** Walking speed in m/s on a grade (rise/run), Tobler's hiking function. */
const hikeSpeed = (grade, pace) =>
  ((6 * Math.exp(-3.5 * Math.abs(grade + 0.05)) * 1000) / 3600) * pace

/** Riding speed in m/s at constant power on a grade (Newton on the power balance). */
function rideSpeed(grade, power) {
  const mass = 82
  const crr = 0.005
  const cda = 0.34
  const rho = 1.05
  const theta = Math.atan(grade)
  const force = mass * 9.81 * (Math.sin(theta) + crr * Math.cos(theta))
  let v = 6
  for (let i = 0; i < 30; i++) {
    const f = force * v + 0.5 * rho * cda * v ** 3 - power * 0.97
    const df = force + 1.5 * rho * cda * v ** 2
    v = Math.max(0.8, v - f / df)
  }
  return Math.min(v, 16)
}

/** Energy cost of running in J/(kg·m) on a grade (Minetti et al. 2002). */
const runningCost = (grade) => {
  const i = Math.max(-0.45, Math.min(0.45, grade))
  return (
    155.4 * i ** 5 -
    30.4 * i ** 4 -
    43.3 * i ** 3 +
    46.3 * i ** 2 +
    19.5 * i +
    3.6
  )
}

/** Running speed in m/s at constant effort: `speed` on the flat. */
const runSpeed = (grade, speed) =>
  Math.min(
    speed * 1.25,
    Math.max(0.9, (speed * runningCost(0)) / runningCost(grade))
  )

/**
 * Samples a GPS logger moving along `path` (with DEM elevations): one fix
 * every `interval` s, speed from the activity model, rest stops, jitter.
 */
async function record(preset, path) {
  const rand = random(hash(preset.id))
  const pace = walker(rand, 0.995)
  const jitterE = walker(rand, 0.9)
  const jitterN = walker(rand, 0.9)
  const baro = walker(rand, 0.97)

  const distance = [0]
  for (let i = 1; i < path.length; i++) {
    distance.push(distance[i - 1] + haversine(path[i - 1], path[i]))
  }

  // elevation smoothed like a barometric altimeter: a ~30 m DEM sampled along
  // switchbacks jumps between the slope above and below the road
  const window = { ride: 150, hike: 80, run: 60 }[preset.model]
  const raw = await Promise.all(path.map((p) => elevation(p)))
  const ele = raw.map((_, i) => {
    let sum = 0
    let n = 0
    for (let k = i; k >= 0 && distance[i] - distance[k] <= window; k--) {
      sum += raw[k]
      n++
    }
    for (
      let k = i + 1;
      k < raw.length && distance[k] - distance[i] <= window;
      k++
    ) {
      sum += raw[k]
      n++
    }
    return sum / n
  })

  const total = distance.at(-1)
  const stops = preset.stops.map((stop) => ({
    ...stop,
    distance: stop.at * total
  }))

  const fixes = []
  const startTime = Date.parse(preset.start)
  let t = 0
  let s = 0
  let i = 1
  let nextFix = 0
  const fix = (point, time, meters) => {
    const sigma = preset.model === 'ride' ? 1.8 : 2.6
    const p = offset(point, jitterE() * sigma, jitterN() * sigma)
    fixes.push({
      ...p,
      ele: meters + baro() * 0.8,
      time: startTime + time * 1000
    })
  }

  while (i < path.length) {
    const segment = distance[i] - distance[i - 1]
    const grade = segment > 0 ? (ele[i] - ele[i - 1]) / segment : 0
    const base =
      preset.model === 'ride'
        ? rideSpeed(grade, preset.power)
        : preset.model === 'run'
          ? runSpeed(grade, preset.speed)
          : hikeSpeed(grade, preset.pace)
    const speed = base * (1 + pace() * 0.12)

    // advance to the next fix or the end of the segment, whichever comes first
    const remaining = distance[i] - s
    const dt = Math.min(nextFix - t, remaining / speed)
    if (nextFix - t <= remaining / speed) {
      s += speed * dt
      t = nextFix
      const k = (s - distance[i - 1]) / (segment || 1)
      const a = path[i - 1]
      const b = path[i]
      fix(
        { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k },
        t,
        ele[i - 1] + (ele[i] - ele[i - 1]) * k
      )
      nextFix += preset.interval

      const stop = stops.find((x) => !x.done && s >= x.distance)
      if (stop) {
        stop.done = true
        const resume = t + stop.minutes * 60
        const here = fixes.at(-1)
        while (nextFix < resume) {
          fix(offset(here, jitterE() * 1.5, jitterN() * 1.5), nextFix, here.ele)
          nextFix += preset.interval
        }
        t = resume
      }
    } else {
      s = distance[i]
      t += dt
      i++
    }
  }
  fix(path.at(-1), t, ele.at(-1))
  return { fixes, distance: total }
}

// ---------------------------------------------------------------- points of interest

const POI_KINDS = [
  { key: 'mountain_pass', value: 'yes', label: 'Pass', sym: 'Summit', rank: 4 },
  { key: 'natural', value: 'peak', label: 'Peak', sym: 'Summit', rank: 4 },
  { key: 'natural', value: 'saddle', label: 'Saddle', sym: 'Summit', rank: 3 },
  {
    key: 'railway',
    value: 'station',
    label: 'Station',
    sym: 'Ground Transportation',
    rank: 3
  },
  {
    key: 'railway',
    value: 'halt',
    label: 'Station',
    sym: 'Ground Transportation',
    rank: 3
  },
  {
    key: 'place',
    value: 'village',
    label: 'Village',
    sym: 'City (Small)',
    rank: 3,
    radius: 450
  },
  {
    key: 'place',
    value: 'hamlet',
    label: 'Hamlet',
    sym: 'City (Small)',
    rank: 3,
    radius: 300
  },
  {
    key: 'place',
    value: 'locality',
    label: 'Locality',
    sym: 'Crossing',
    rank: 2,
    radius: 250
  },
  { key: 'tourism', value: 'alpine_hut', label: 'Hut', sym: 'Lodge', rank: 3 },
  {
    key: 'tourism',
    value: 'wilderness_hut',
    label: 'Hut',
    sym: 'Lodge',
    rank: 3
  },
  { key: 'tourism', value: 'hotel', label: 'Hotel', sym: 'Lodging', rank: 2 },
  {
    key: 'tourism',
    value: 'camp_site',
    label: 'Campground',
    sym: 'Campground',
    rank: 3
  },
  {
    key: 'tourism',
    value: 'viewpoint',
    label: 'Viewpoint',
    sym: 'Scenic Area',
    rank: 2
  },
  {
    key: 'natural',
    value: 'waterfall',
    label: 'Waterfall',
    sym: 'Scenic Area',
    rank: 2
  },
  {
    key: 'amenity',
    value: 'restaurant',
    label: 'Restaurant',
    sym: 'Restaurant',
    rank: 2
  },
  {
    key: 'amenity',
    value: 'shelter',
    label: 'Shelter',
    sym: 'Building',
    rank: 2
  },
  {
    key: 'amenity',
    value: 'drinking_water',
    label: 'Water',
    sym: 'Drinking Water',
    rank: 1
  },
  {
    key: 'amenity',
    value: 'toilets',
    label: 'Toilets',
    sym: 'Restroom',
    rank: 0
  }
]

function poiKind(tags) {
  return POI_KINDS.find((kind) => tags[kind.key] === kind.value)
}

async function pointsOfInterest(preset, path, total) {
  const filters = POI_KINDS.map(
    ({ key, value, radius = 100 }) =>
      `nwr(around.route:${radius})["${key}"="${value}"];`
  ).join('')
  const { elements } = await overpass(
    `${preset.query}->.route;(${filters});out center tags;`
  )

  // position along the route of each candidate
  const along = [0]
  for (let i = 1; i < path.length; i++)
    along.push(along[i - 1] + haversine(path[i - 1], path[i]))
  const candidates = elements
    .map((element) => {
      const kind = poiKind(element.tags)
      if (!kind) return undefined
      const at = element.center ?? element
      let best = 0
      let bestDistance = Infinity
      for (let i = 0; i < path.length; i += 2) {
        const d = haversine(path[i], at)
        if (d < bestDistance) {
          bestDistance = d
          best = i
        }
      }
      if (bestDistance > (kind.radius ?? 90)) return undefined
      const named = Boolean(element.tags.name)
      return {
        element: { ...element, lat: at.lat, lon: at.lon },
        kind,
        at: along[best],
        score: kind.rank + (named ? 3 : 0) - bestDistance / (kind.radius ?? 100)
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)

  const chosen = []
  for (const candidate of candidates) {
    if (chosen.length >= 7) break
    if (candidate.at < total * 0.04 || candidate.at > total * 0.96) continue
    if (chosen.some((c) => Math.abs(c.at - candidate.at) < total * 0.07))
      continue
    chosen.push(candidate)
  }
  return chosen.sort((a, b) => a.at - b.at)
}

// ---------------------------------------------------------------- GPX

const xml = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const iso = (time) =>
  new Date(Math.round(time / 1000) * 1000).toISOString().replace('.000Z', 'Z')
const coord = (p) => `lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"`

function timeAt(fixes, along, meters) {
  const index = along.findIndex((d) => d >= meters)
  return fixes[index === -1 ? fixes.length - 1 : index].time
}

function gpx(preset, { fixes, waypoints }) {
  const lats = fixes.map((p) => p.lat)
  const lons = fixes.map((p) => p.lon)
  const end = fixes.at(-1).time
  const link = preset.link ?? {
    href: `https://www.openstreetmap.org/${preset.osm.type}/${preset.osm.id}`,
    text: `OpenStreetMap ${preset.osm.type} ${preset.osm.id}`
  }
  const synthetic = {
    ride: 'Timestamps are synthesized with a constant-power cycling model',
    run: "Timestamps are synthesized with a constant-effort running model (Minetti's energy cost of running on grades)",
    hike: "Timestamps are synthesized with Tobler's hiking function"
  }[preset.model]

  const wpt = waypoints
    .map(
      (w) => `  <wpt ${coord(w)}>
    <ele>${w.ele.toFixed(1)}</ele>
    <time>${iso(w.time)}</time>
    <name>${xml(w.name)}</name>${w.desc ? `\n    <desc>${xml(w.desc)}</desc>` : ''}${w.link ? `\n    <link href="${xml(w.link)}"><text>OpenStreetMap</text></link>` : ''}
    <sym>${xml(w.sym)}</sym>
    <type>${xml(w.type)}</type>
  </wpt>`
    )
    .join('\n')

  const trkpt = fixes
    .map(
      (p) =>
        `      <trkpt ${coord(p)}><ele>${p.ele.toFixed(1)}</ele><time>${iso(p.time)}</time></trkpt>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPX Terrain (scripts/make-presets.mjs)" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${xml(preset.name)}</name>
    <desc>${xml(`${preset.desc} Demo track: geometry from OpenStreetMap, elevations from AWS Terrain Tiles. ${synthetic}; this is not a real recording.`)}</desc>
    <author>
      <name>GPX Terrain</name>
      <link href="https://github.com/whidrubeld/gpx-terrain"><text>GPX Terrain</text></link>
    </author>
    <copyright author="OpenStreetMap contributors">
      <year>${new Date(end).getUTCFullYear()}</year>
      <license>https://opendatacommons.org/licenses/odbl/1-0/</license>
    </copyright>
    <link href="${xml(link.href)}"><text>${xml(link.text)}</text></link>
    <time>${iso(end + 4 * 60 * 1000)}</time>
    <keywords>${preset.type}, demo, synthetic timing</keywords>
    <bounds minlat="${Math.min(...lats).toFixed(7)}" minlon="${Math.min(...lons).toFixed(7)}" maxlat="${Math.max(...lats).toFixed(7)}" maxlon="${Math.max(...lons).toFixed(7)}"/>
  </metadata>
${wpt}
  <trk>
    <name>${xml(preset.name)}</name>
    <type>${preset.type}</type>
    <trkseg>
${trkpt}
    </trkseg>
  </trk>
</gpx>
`
}

// ---------------------------------------------------------------- main

/** Places given as OpenStreetMap elements: where they are, and their name. */
async function resolvePlaces(places) {
  const elements = places.filter((place) => place.osm)
  if (!elements.length) return places
  const query = elements
    .map(({ osm }) => {
      const [type, id] = osm.split('/')
      return `${type}(${id});`
    })
    .join('')
  const found = (await overpass(`(${query});out center tags;`)).elements
  return places.map((place) => {
    if (!place.osm) return place
    const element = found.find((e) => `${e.type}/${e.id}` === place.osm)
    if (!element) throw new Error(`${place.osm} not found`)
    const at = element.center ?? element
    return {
      ...place,
      name: place.name ?? element.tags.name,
      lat: at.lat,
      lon: at.lon
    }
  })
}

async function build(preset) {
  console.log(
    `${preset.id}: fetching ${preset.osm ? `${preset.osm.type} ${preset.osm.id}` : 'the streets'}`
  )
  const { elements } = await overpass(`${preset.query};out geom;`)
  const ways = elements.filter((e) => e.type === 'way' && e.geometry)
  const nodes = buildGraph(ways)

  const highest = preset.to === 'highest'
  const [start, ...stops] = await resolvePlaces([
    preset.from,
    ...(preset.via ?? []),
    ...(highest ? [] : [preset.to])
  ])
  const via = highest ? stops : stops.slice(0, -1)
  const end = highest ? undefined : stops.at(-1)

  const from = nearest(nodes, start)
  let to
  if (highest) {
    const heights = await Promise.all(nodes.map((n) => elevation(n)))
    to = nodes[heights.indexOf(Math.max(...heights))]
  } else {
    to = nearest(nodes, end)
  }

  // by way of the places in between, if any; where each is reached (m)
  const places = [from, ...via.map((p) => nearest(nodes, p)), to]
  const reached = [0]
  const route = places.slice(1).flatMap((place, i) => {
    const leg = shortestPath(nodes, places[i], place)
    let length = reached[i]
    for (let k = 1; k < leg.length; k++) length += haversine(leg[k - 1], leg[k])
    reached.push(length)
    return i === 0 ? leg : leg.slice(1)
  })
  const path = densify(route, 4)
  const { fixes, distance } = await record(preset, path)

  const along = [0]
  for (let i = 1; i < fixes.length; i++)
    along.push(along[i - 1] + haversine(fixes[i - 1], fixes[i]))
  const scale = along.at(-1) / distance

  // the places on the way, or what lies along it
  const sights =
    preset.waypoints === 'via'
      ? via.map((place, i) => ({
          lat: place.lat,
          lon: place.lon,
          name: place.name,
          desc: place.label,
          link: `https://www.openstreetmap.org/${place.osm}`,
          sym: place.sym,
          type: place.label.toLowerCase(),
          time: timeAt(fixes, along, reached[i + 1] * scale)
        }))
      : (await pointsOfInterest(preset, path, distance)).map(
          ({ element, kind, at }) => ({
            lat: element.lat,
            lon: element.lon,
            name: element.tags.name ?? kind.label,
            desc: [
              kind.label,
              element.tags.ele && `${element.tags.ele} m`,
              element.tags.description
            ]
              .filter(Boolean)
              .join(' · '),
            link: `https://www.openstreetmap.org/${element.type}/${element.id}`,
            sym: kind.sym,
            type: kind.label.toLowerCase(),
            time: timeAt(fixes, along, at * scale)
          })
        )
  const endpoint = (point, name, time, type) => ({
    ...point,
    name,
    time,
    sym: type === 'start' ? 'Trailhead' : 'Flag, Red',
    type
  })
  const waypoints = [
    endpoint(fixes[0], start.name, fixes[0].time, 'start'),
    ...sights,
    endpoint(
      fixes.at(-1),
      preset.toName ?? end.name,
      fixes.at(-1).time,
      'finish'
    )
  ]
  for (const w of waypoints) w.ele = await elevation(w)

  const file = new URL(`${preset.id}.gpx`, OUT)
  await mkdir(OUT, { recursive: true })
  await writeFile(file, gpx(preset, { fixes, waypoints }))

  const hours = (fixes.at(-1).time - fixes[0].time) / 3.6e6
  console.log(
    `  ${(distance / 1000).toFixed(2)} km, ${fixes.length} fixes, ${hours.toFixed(2)} h, ` +
      `${waypoints.length} waypoints (${sights.map((w) => w.name).join(', ')})`
  )
}

const only = process.argv.slice(2)
for (const preset of PRESETS) {
  if (only.length && !only.includes(preset.id)) continue
  await build(preset)
}
