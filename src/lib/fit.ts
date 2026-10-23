import { Utils } from 'three-map-terrain'

import { type Bounds, EARTH_CIRCUMFERENCE } from './geo'

/** Scene units per tile, as in `defaultMapOptions`. */
export const TILE_SIZE = 600
/** AWS terrarium tiles go to 15; a city fits at 14, with trees. */
export const MAX_ZOOM = 14
export const MIN_ZOOM = 3
/**
 * The deepest imagery worth loading: Sentinel-2 has 10 m pixels, and EOX's
 * deeper tiles are the same picture enlarged.
 */
export const IMAGERY_MAX_ZOOM = 14

/** Tiles of one zoom, inclusive: the grid of the map. */
export interface TileRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** How the `Map` grid is laid out so that a route fits on it. */
export interface TerrainFit {
  zoom: number
  /** a rectangle of tiles around the route */
  grid: TileRect
  /** tiles west–east and north–south */
  columns: number
  rows: number
  /** a point inside the grid's middle tile, its frame: `new Map({ location })` */
  location: { lat: number; lon: number }
  /**
   * zoom of the imagery: four tiles per terrain tile, one zoom deeper — a
   * single one at `IMAGERY_MAX_ZOOM`, where the photo's detail ends
   */
  imageryZoom: number
  tileSize: number
  /** meters per scene unit at the grid center */
  metersPerUnit: number
  /** true-scale `MapOptions.zScale` (scene units per meter of elevation) */
  zScale: number
  /** geographic extent of the whole grid */
  extent: Bounds
  key: string
}

/** The longer side of the grid, in scene units. */
export const gridSize = (fit: TerrainFit) =>
  fit.tileSize * Math.max(fit.columns, fit.rows)

/**
 * The tiles from `low` to `high` grown to `size`, a tile at a time on the
 * side the route (centered at `middle`) is nearer to: it stays in the
 * middle as much as whole tiles allow.
 */
function grow(low: number, high: number, size: number, middle: number) {
  while (high - low + 1 < size) {
    if (middle - low < high + 1 - middle) low--
    else high++
  }
  return [low, high] as const
}

/**
 * The deepest zoom at which `bounds` (plus `margin` tiles around) fits in
 * `maxTiles` tiles each way, and the rectangle of tiles around it there —
 * the route in its middle, not in a corner of a square. Never narrower
 * than half its length, nor than two tiles: a long, straight route keeps a
 * landscape around.
 */
export function fitTerrain(
  bounds: Bounds,
  maxTiles: number,
  margin = 0.12
): TerrainFit {
  let zoom = MAX_ZOOM
  let grid: TileRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  for (; zoom >= MIN_ZOOM; zoom--) {
    const nw = Utils.position2tileFraction(bounds.north, bounds.west, zoom)
    const se = Utils.position2tileFraction(bounds.south, bounds.east, zoom)
    let minX = Math.floor(nw.x - margin)
    let maxX = Math.floor(se.x + margin)
    let minY = Math.floor(nw.y - margin)
    let maxY = Math.floor(se.y + margin)
    // a route across the antimeridian wraps: se.x < nw.x, never fits
    if (maxX < minX) continue
    const long = Math.max(maxX - minX, maxY - minY) + 1
    if (long > maxTiles) continue
    const short = Math.min(long, Math.max(2, Math.ceil(long / 2)))
    ;[minX, maxX] = grow(minX, maxX, short, (nw.x + se.x) / 2)
    ;[minY, maxY] = grow(minY, maxY, short, (nw.y + se.y) / 2)
    grid = { minX, minY, maxX, maxY }
    break
  }
  zoom = Math.max(zoom, MIN_ZOOM)

  const middle = {
    x: Math.floor((grid.minX + grid.maxX) / 2),
    y: Math.floor((grid.minY + grid.maxY) / 2)
  }
  const location = {
    lat: Utils.tile2lat(middle.y + 0.5, zoom),
    lon: Utils.tile2lon(middle.x + 0.5, zoom)
  }
  const tileMeters =
    (EARTH_CIRCUMFERENCE * Math.cos((location.lat * Math.PI) / 180)) / 2 ** zoom
  const metersPerUnit = tileMeters / TILE_SIZE

  return {
    zoom,
    grid,
    columns: grid.maxX - grid.minX + 1,
    rows: grid.maxY - grid.minY + 1,
    location,
    imageryZoom: Math.max(zoom, Math.min(zoom + 1, IMAGERY_MAX_ZOOM)),
    tileSize: TILE_SIZE,
    metersPerUnit,
    zScale: 1 / metersPerUnit,
    extent: {
      west: Utils.tile2lon(grid.minX, zoom),
      east: Utils.tile2lon(grid.maxX + 1, zoom),
      north: Utils.tile2lat(grid.minY, zoom),
      south: Utils.tile2lat(grid.maxY + 1, zoom)
    },
    key: `${zoom}/${grid.minX}/${grid.minY}/${grid.maxX}/${grid.maxY}`
  }
}
