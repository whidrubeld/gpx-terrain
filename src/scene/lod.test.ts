import {
  Group,
  Mesh,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Vector3
} from 'three'
import { type Map, type Tile, Utils, Water } from 'three-map-terrain'
import { describe, expect, it, vi } from 'vitest'

import {
  COARSE_CELL_PX,
  coarseSegments,
  DETAIL_CELL_PX,
  KEEP_MS,
  TerrainLod,
  tileKeyOf,
  wantsDetail
} from './lod'

const ZOOM = 14
const TILE = 600

function fakeTile(x: number, y: number): Tile {
  const mesh = new Mesh(new PlaneGeometry(TILE, TILE))
  mesh.position.set(x * TILE, -y * TILE, 0)
  return {
    x,
    y,
    z: ZOOM,
    loaded: true,
    mesh,
    key: () => Utils.getTileKey(ZOOM, x, y)
  } as unknown as Tile
}

/** A map of the tiles `(x, 0)` for `x` in `xs`; `z` of its surface: its mesh. */
function fakeMap(segments: number, xs: number[]) {
  const tileCache: Record<string, Tile> = {}
  const add = (x: number, y: number) => {
    const tile = fakeTile(x, y)
    tileCache[tile.key()] = tile
  }
  for (const x of xs) add(x, 0)
  const layer = new Water({ source: { api: 'openfreemap' } })
  const map = {
    options: { zoom: ZOOM, tileSize: TILE, tileSegments: segments },
    terrain: new Group(),
    tileCache,
    layers: [layer],
    focus: undefined,
    addTileSegment: vi.fn((x: number, y: number) => {
      add(x, y)
      return Promise.resolve()
    }),
    removeTileSegment: vi.fn((x: number, y: number) =>
      Reflect.deleteProperty(tileCache, Utils.getTileKey(ZOOM, x, y))
    ),
    getTerrainPositionSync: () => ({ x: 0, y: 0, z: segments }),
    getPosition: () => ({ x: 0, y: 0, z: -1 }),
    getLocation: () => ({ lat: 0, lon: 0, alt: 0 }),
    pick: (): { point: Vector3 } | undefined => undefined
  }
  return { map, layer }
}

/** A feature of a layer on a tile, named as the layers name them. */
function feature(layer: Water, key: string) {
  const object = new Object3D()
  object.name = `water water ${key}`
  layer.group.add(object)
  return object
}

/** The camera `height` above the middle of tile (x, 0). */
function cameraAbove(x: number, height: number) {
  const camera = new PerspectiveCamera(45, 1, 1, 1e6)
  camera.position.set(x * TILE, 0, height)
  camera.updateMatrixWorld()
  return camera
}

const middleOf = (x: number) => ({
  lat: Utils.tile2lat(0.5, ZOOM),
  lon: Utils.tile2lon(x + 0.5, ZOOM)
})

describe('levels of detail', () => {
  it('draw a tile in detail while a coarse cell is large on screen, with a margin', () => {
    expect(wantsDetail(DETAIL_CELL_PX + 1, false)).toBe(true)
    expect(wantsDetail(DETAIL_CELL_PX - 1, false)).toBe(false)
    // once detailed, it stays so down to the lower bound
    expect(wantsDetail(DETAIL_CELL_PX - 1, true)).toBe(true)
    expect(wantsDetail(COARSE_CELL_PX - 1, true)).toBe(false)
    expect(coarseSegments(128)).toBe(64)
    expect(coarseSegments(16)).toBe(16)
  })

  it('read the tile of an object from its name', () => {
    const object = new Object3D()
    object.name = 'trees crowns 14/8659/5785 outline'
    expect(tileKeyOf(object)).toBe('14/8659/5785')
    object.name = 'distance'
    expect(tileKeyOf(object)).toBeUndefined()
  })

  it('swap a tile the camera is near once it is complete, and back', () => {
    const coarse = fakeMap(64, [0, 1, 2])
    const detail = fakeMap(128, [])
    const textured = new Set<string>()
    const lod = new TerrainLod(
      coarse.map as unknown as Map,
      detail.map as unknown as Map,
      (tile) => textured.has(tile.key())
    )
    const near = Utils.getTileKey(ZOOM, 0, 0)
    const coarseFeature = feature(coarse.layer, near)
    const farFeature = feature(coarse.layer, Utils.getTileKey(ZOOM, 2, 0))

    // close above tile 0: it and its neighbour are loaded in detail, tile 2
    // is far enough to stay coarse; they wait for their imagery
    expect(lod.update(cameraAbove(0, 100), 800)).toBe(false)
    expect(detail.map.addTileSegment.mock.calls).toEqual([
      [0, 0],
      [1, 0]
    ])
    lod.apply()
    expect(coarse.map.tileCache[near].mesh.visible).toBe(true)
    expect(detail.map.tileCache[near].mesh.visible).toBe(false)

    textured.add(near)
    expect(lod.update(cameraAbove(0, 100), 800)).toBe(true)
    const detailFeature = feature(detail.layer, near)
    lod.apply()
    expect([...lod.shown]).toEqual([near])
    // the coarse tile and its features are hidden, from rays too
    expect(coarse.map.tileCache[near].mesh.visible).toBe(false)
    expect(coarse.map.tileCache[near].mesh.layers.mask).toBe(0)
    expect(coarseFeature.layers.mask).toBe(0)
    expect(farFeature.layers.mask).toBe(1)
    expect(detail.map.tileCache[near].mesh.visible).toBe(true)
    expect(detailFeature.layers.mask).toBe(1)
    // what lies on the terrain follows the level drawn
    expect(lod.getTerrainPositionSync(middleOf(0))?.z).toBe(128)
    expect(lod.getTerrainPositionSync(middleOf(2))?.z).toBe(64)

    // far away: back to the coarse tile; the complete detailed one is kept a
    // while, hidden, the one still loading is dropped at once
    const away = cameraAbove(0, 50_000)
    expect(lod.update(away, 800, 0)).toBe(true)
    lod.apply()
    expect(lod.shown.size).toBe(0)
    expect(detail.map.removeTileSegment.mock.calls).toEqual([[1, 0]])
    expect(detail.map.tileCache[near].mesh.visible).toBe(false)
    expect(coarse.map.tileCache[near].mesh.visible).toBe(true)
    expect(coarseFeature.layers.mask).toBe(1)

    // back within the while: shown at once
    expect(lod.update(cameraAbove(0, 100), 800, 1000)).toBe(true)
    expect([...lod.shown]).toEqual([near])

    // gone for longer: dropped
    lod.update(away, 800, 2000)
    lod.update(away, 800, 2000 + KEEP_MS + 1)
    expect(detail.map.removeTileSegment).toHaveBeenCalledWith(0, 0)
    expect(near in detail.map.tileCache).toBe(false)
  })

  it('pick the nearer of the two maps', () => {
    const coarse = fakeMap(64, [0])
    const detail = fakeMap(128, [])
    const lod = new TerrainLod(
      coarse.map as unknown as Map,
      detail.map as unknown as Map
    )
    const raycaster = new Raycaster(new Vector3(), new Vector3(0, 0, -1))
    const far = { point: new Vector3(0, 0, -20) }
    const near = { point: new Vector3(0, 0, -10) }
    coarse.map.pick = () => far
    expect(lod.pick(raycaster)).toBe(far)
    detail.map.pick = () => near
    expect(lod.pick(raycaster)).toBe(near)
  })

  it('leave a single map alone', () => {
    const coarse = fakeMap(128, [0])
    const lod = new TerrainLod(coarse.map as unknown as Map, null)
    expect(lod.update(cameraAbove(0, 100), 800)).toBe(false)
    lod.apply()
    expect(
      coarse.map.tileCache[Utils.getTileKey(ZOOM, 0, 0)].mesh.visible
    ).toBe(true)
    expect(lod.getTerrainPositionSync(middleOf(0))?.z).toBe(128)
  })
})
