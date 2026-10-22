import {
  Box3,
  MathUtils,
  type Object3D,
  type PerspectiveCamera,
  type Raycaster,
  Vector3
} from 'three'
import { FeatureLayer, type Map, type Tile, Utils } from 'three-map-terrain'

import type { Surface } from '../state/viewer'

/** CSS px a cell of the coarse mesh may span before its tile is drawn in detail… */
export const DETAIL_CELL_PX = 16
/** …and below which it is coarse again: a margin, so that no tile flips back and forth. */
export const COARSE_CELL_PX = 12

/** The coarse mesh: half the segments of the detailed one. */
export const coarseSegments = (segments: number) =>
  Math.max(16, Math.round(segments / 2))

/** Whether a tile is drawn in detail, from how large a coarse cell is on screen. */
export const wantsDetail = (cellPx: number, detailed: boolean) =>
  detailed ? cellPx >= COARSE_CELL_PX : cellPx > DETAIL_CELL_PX

const TILE_KEY = /^\d+\/\d+\/\d+$/

/** The tile an object of a layer is drawn on: it is named '<layer> <part> <z/x/y>'. */
export const tileKeyOf = (object: Object3D) =>
  object.name.split(' ').find((word) => TILE_KEY.test(word))

/**
 * Shows or hides an object to the camera and to rays through its layers:
 * its `visible` is the layer's, for `maxDistance`.
 */
const reveal = (object: Object3D, shown: boolean) => {
  object.layers.mask = shown ? 1 : 0
}

/** A tile, and with it its skirt. */
const revealTile = (tile: Tile, shown: boolean) => {
  tile.mesh.visible = shown
  reveal(tile.mesh, shown)
}

const BOX = new Box3()
const EYE = new Vector3()

/** The tile's bounds in its map's coordinates. */
function tileBox(tile: Tile, box: Box3) {
  const { geometry, position } = tile.mesh
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  if (geometry.boundingBox) box.copy(geometry.boundingBox)
  else box.makeEmpty()
  return box.translate(position)
}

/**
 * Levels of detail — three-map-terrain's two maps of one zoom, lined up: a
 * coarse one holds the whole grid (what the base, the camera's bounds and
 * the tile counts read), a detailed one the tiles the camera is near. A
 * detailed tile replaces its coarse one once it is complete — heights,
 * imagery, the features drawn on it — and the coarse tile and its features
 * are hidden then, never removed: nothing is missing while tiles change.
 * Skirts close the steps between the two meshes. As a `Surface`, the
 * terrain as drawn: what lies on it and picking follow the level shown.
 */
export class TerrainLod implements Surface {
  /** Tiles the detailed map draws; their coarse ones are hidden. */
  readonly shown = new Set<string>()
  /** Tiles the camera is near: loaded in detail, shown once complete. */
  private readonly wanted = new Set<string>()
  private readonly keys = new WeakMap<Object3D, string | null>()

  constructor(
    readonly coarse: Map,
    readonly detail: Map | null,
    /** Whether a loaded detailed tile has what it shows besides features: its imagery. */
    private readonly textured: (tile: Tile) => boolean = () => true
  ) {}

  /**
   * Picks every tile's level for the camera — `height`: the canvas, CSS px
   * — and swaps those that are ready. Returns whether the drawn surface
   * changed: what lies on it follows.
   */
  update(camera: PerspectiveCamera, height: number): boolean {
    const { coarse, detail, wanted, shown } = this
    if (!detail) return false
    detail.focus = coarse.focus
    const focal =
      (height * camera.zoom) /
      (2 * Math.tan(MathUtils.degToRad(camera.fov) / 2))
    EYE.setFromMatrixPosition(camera.matrixWorld)
    coarse.terrain.updateWorldMatrix(true, false)
    // a coarse cell across: the world is scaled only vertically
    const cell = coarse.options.tileSize / coarse.options.tileSegments
    for (const tile of Object.values(coarse.tileCache)) {
      if (!tile.loaded) continue
      const key = tile.key()
      tileBox(tile, BOX).applyMatrix4(coarse.terrain.matrixWorld)
      const distance = Math.max(BOX.distanceToPoint(EYE), 1e-6)
      if (wantsDetail((cell * focal) / distance, wanted.has(key))) {
        wanted.add(key)
        if (!(key in detail.tileCache))
          void detail.addTileSegment(tile.x, tile.y)
      } else wanted.delete(key)
    }

    let changed = false
    for (const tile of Object.values(detail.tileCache)) {
      const key = tile.key()
      if (!wanted.has(key)) {
        // the coarse tile is there all along
        if (shown.delete(key)) changed = true
        detail.removeTileSegment(tile.x, tile.y)
      } else if (!shown.has(key) && this.complete(tile)) {
        shown.add(key)
        changed = true
      }
    }
    return changed
  }

  /** Hides what the other level draws: tiles and the features on them. */
  apply() {
    const { coarse, detail, shown } = this
    if (!detail) return
    for (const tile of Object.values(coarse.tileCache))
      revealTile(tile, !shown.has(tile.key()))
    for (const tile of Object.values(detail.tileCache))
      revealTile(tile, shown.has(tile.key()))
    this.revealFeatures(coarse, false)
    this.revealFeatures(detail, true)
  }

  getTerrainPositionSync(
    location: { lat: number; lon: number },
    opts?: { loadTile: boolean }
  ) {
    const { detail } = this
    if (detail && this.shown.has(this.keyAt(location))) {
      const position = detail.getTerrainPositionSync(location, {
        loadTile: false
      })
      if (position) return position
    }
    return this.coarse.getTerrainPositionSync(location, opts)
  }

  /** The maps share their frame: positions are the coarse one's. */
  getPosition(...args: Parameters<Map['getPosition']>) {
    return this.coarse.getPosition(...args)
  }

  getLocation(...args: Parameters<Map['getLocation']>) {
    return this.coarse.getLocation(...args)
  }

  /** The nearer hit of the two maps; hidden tiles are not hit. */
  pick(raycaster: Raycaster) {
    const near = this.detail?.pick(raycaster)
    const far = this.coarse.pick(raycaster)
    if (!near || !far) return near ?? far
    const { origin } = raycaster.ray
    return near.point.distanceToSquared(origin) <=
      far.point.distanceToSquared(origin)
      ? near
      : far
  }

  /** Loaded, textured, and every layer done drawing it. */
  private complete(tile: Tile) {
    return (
      tile.loaded &&
      this.textured(tile) &&
      (this.detail?.layers ?? []).every(
        (layer) => !(layer instanceof FeatureLayer) || !layer.pending(tile)
      )
    )
  }

  /** The features of a map: on the shown tiles for the detailed one, on the others for the coarse one. */
  private revealFeatures(map: Map, detailed: boolean) {
    for (const layer of map.layers) {
      if (!(layer instanceof FeatureLayer)) continue
      for (const object of layer.group.children) {
        let key = this.keys.get(object)
        if (key === undefined) {
          key = tileKeyOf(object) ?? null
          this.keys.set(object, key)
        }
        if (key !== null) reveal(object, this.shown.has(key) === detailed)
      }
    }
  }

  private keyAt({ lat, lon }: { lat: number; lon: number }) {
    const { zoom } = this.coarse.options
    const { x, y } = Utils.position2tile(lat, lon, zoom)
    return Utils.getTileKey(zoom, x, y)
  }
}
