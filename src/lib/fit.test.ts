import { Utils } from 'three-map-terrain'
import { describe, expect, it } from 'vitest'

import { fitTerrain, gridSize, IMAGERY_MAX_ZOOM, MAX_ZOOM } from './fit'
import type { Bounds } from './geo'

/** The bounds' middle and the grid's, in tiles of the fit's zoom. */
function middles(bounds: Bounds, maxTiles: number) {
  const fit = fitTerrain(bounds, maxTiles)
  const nw = Utils.position2tileFraction(bounds.north, bounds.west, fit.zoom)
  const se = Utils.position2tileFraction(bounds.south, bounds.east, fit.zoom)
  return {
    fit,
    route: { x: (nw.x + se.x) / 2, y: (nw.y + se.y) / 2 },
    grid: {
      x: (fit.grid.minX + fit.grid.maxX + 1) / 2,
      y: (fit.grid.minY + fit.grid.maxY + 1) / 2
    }
  }
}

describe('fitTerrain', () => {
  const eiger = { south: 46.5754, west: 7.9736, north: 46.6005, east: 8.0122 }
  // Ouchy – Sauvabelin: narrow, north to south, across a tile border
  const lausanne = {
    south: 46.5065,
    west: 6.6258,
    north: 46.5393,
    east: 6.638
  }

  it('picks the deepest zoom whose grid contains the bounds', () => {
    for (const maxTiles of [3, 5]) {
      const fit = fitTerrain(eiger, maxTiles)
      const { extent } = fit
      expect(extent.west).toBeLessThan(eiger.west)
      expect(extent.east).toBeGreaterThan(eiger.east)
      expect(extent.south).toBeLessThan(eiger.south)
      expect(extent.north).toBeGreaterThan(eiger.north)
      expect(Math.max(fit.columns, fit.rows)).toBeLessThanOrEqual(maxTiles)
      // one zoom deeper does not fit
      if (fit.zoom < MAX_ZOOM) {
        const deeper = fit.zoom + 1
        const nw = Utils.position2tileFraction(eiger.north, eiger.west, deeper)
        const se = Utils.position2tileFraction(eiger.south, eiger.east, deeper)
        const span = Math.max(se.x - nw.x, se.y - nw.y)
        expect(Math.floor(span + 0.24)).toBeGreaterThanOrEqual(maxTiles - 1)
      }
    }
    expect(fitTerrain(eiger, 5).zoom).toBeGreaterThanOrEqual(
      fitTerrain(eiger, 3).zoom
    )
  })

  it('puts the route in the middle of a rectangle of tiles, not in a corner', () => {
    for (const bounds of [eiger, lausanne]) {
      for (const maxTiles of [3, 5]) {
        const { route, grid } = middles(bounds, maxTiles)
        // whole tiles allow no better than half a tile
        expect(Math.abs(route.x - grid.x)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(route.y - grid.y)).toBeLessThanOrEqual(0.5)
      }
    }
    // Lausanne is taller than wide: two columns, three rows
    expect(fitTerrain(lausanne, 3)).toMatchObject({
      zoom: 14,
      columns: 2,
      rows: 3
    })
  })

  it('keeps a landscape around a long, straight route', () => {
    const meridian = { south: 46.4, west: 8, north: 46.7, east: 8.001 }
    for (const maxTiles of [3, 5]) {
      const fit = fitTerrain(meridian, maxTiles)
      expect(fit.rows).toBeGreaterThan(1)
      expect(fit.columns).toBeGreaterThanOrEqual(
        Math.max(2, Math.ceil(fit.rows / 2))
      )
      expect(gridSize(fit)).toBe(fit.rows * fit.tileSize)
    }
  })

  it('frames the map on a location inside the middle tile', () => {
    const { location, zoom, grid } = fitTerrain(eiger, 3)
    const tile = Utils.position2tile(location.lat, location.lon, zoom)
    expect(tile.x).toBe(Math.floor((grid.minX + grid.maxX) / 2))
    expect(tile.y).toBe(Math.floor((grid.minY + grid.maxY) / 2))
  })

  it('uses a true-scale zScale (scene units per meter)', () => {
    const fit = fitTerrain(eiger, 3)
    // the library default 0.045 is true scale at zoom 11 around 46°N
    expect(fit.zScale * 2 ** (11 - fit.zoom)).toBeCloseTo(0.0446, 3)
  })

  it('caps the zoom for tiny tracks and zooms out for long ones', () => {
    const point = { south: 46.6, west: 8, north: 46.6001, east: 8.0001 }
    expect(fitTerrain(point, 3).zoom).toBe(MAX_ZOOM)
    const alps = { south: 45.8, west: 6.8, north: 47.0, east: 10.5 }
    expect(fitTerrain(alps, 3).zoom).toBeLessThan(9)
  })

  it('loads imagery a zoom deeper, down to where the photo has detail', () => {
    const alps = { south: 45.8, west: 6.8, north: 47.0, east: 10.5 }
    const wide = fitTerrain(alps, 3)
    expect(wide.imageryZoom).toBe(wide.zoom + 1)
    const point = { south: 46.6, west: 8, north: 46.6001, east: 8.0001 }
    expect(fitTerrain(point, 3)).toMatchObject({
      zoom: MAX_ZOOM,
      imageryZoom: IMAGERY_MAX_ZOOM
    })
  })
})
