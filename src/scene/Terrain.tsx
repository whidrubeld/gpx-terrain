import { invalidate, useFrame } from '@react-three/fiber'
import { useSelector } from '@tanstack/react-store'
import { useEffect, useMemo } from 'react'
import { MeshNormalMaterial, type PerspectiveCamera } from 'three'
import {
  createTerrainMaterial,
  Map,
  type MapLayer,
  type TerrainMaterialInput,
  type Tile
} from 'three-map-terrain'

import type { TerrainFit } from '../lib/fit'
import { settingsStore } from '../state/settings'
import { terrainStore, uiStore } from '../state/viewer'
import { useFeatureLayers, useTerrainBase } from './layers'
import { coarseSegments, TerrainLod } from './lod'
import { LOOK_STYLES, type LookStyle, monochrome } from './look'
import { placedTiles } from './tiles'

/** The style of the current look, in the current theme. */
const currentStyle = () =>
  LOOK_STYLES[settingsStore.state.look][uiStore.state.theme]

/** A processor reloads the imagery: only the gray photo has one. */
const processor = (style: LookStyle) =>
  style.imagery === 'mono' ? monochrome : undefined

/** Tiles whose imagery has arrived. */
const textured = new WeakSet<Tile>()

/**
 * The material of a terrain tile: the library's, on its imagery — or the
 * bare relief in the look's color, without imagery and while it loads; in
 * the look's lines. It reads the settings when the library calls it, so
 * tiles are restyled when those change. The imagery loads in every look:
 * switching is immediate. (The map's own look stays solid: the base keeps
 * its walls; the features take the look's lines themselves, layers.ts.)
 */
function terrainMaterial({ texture, tile, options }: TerrainMaterialInput) {
  if (texture) textured.add(tile)
  // the scene renders on demand: the new material is drawn in a frame
  invalidate()
  const style = currentStyle()
  const { wireframe } = style
  if (texture && style.imagery) {
    return createTerrainMaterial({
      texture,
      options: { ...options, wireframe }
    })
  }
  return createTerrainMaterial({
    texture: null,
    options: { ...options, wireframe, color: style.terrain }
  })
}

/**
 * The bare relief instead of the library's rainbow placeholder while imagery
 * loads — and a frame for every tile placed or stitched.
 */
const placeholders: MapLayer = {
  tileLoaded(tile) {
    invalidate()
    if (!(tile.mesh.material instanceof MeshNormalMaterial)) return
    tile.mesh.material = terrainMaterial({
      texture: null,
      tile,
      options: tile.map.materialOptions
    })
  },
  tileChanged() {
    invalidate()
  }
}

/** Start without the tiles that are still loading after this long (ms). */
const PARTIAL_AFTER = 25_000
const PARTIAL_RETRY = 5_000

function heightRange(map: Map) {
  let min = Infinity
  let max = -Infinity
  for (const { mesh } of placedTiles(map)) {
    const position = mesh.geometry.attributes.position
    for (let i = 0; i < position.count; i++) {
      const z = position.getZ(i)
      if (z < min) min = z
      if (z > max) max = z
    }
  }
  return Number.isFinite(min) ? { min, max } : null
}

/** Whether a tile shows what it should: its imagery, where the look has it. */
const complete = (tile: Tile) =>
  textured.has(tile) || currentStyle().imagery === null

/**
 * The terrain of the grid: one map — or, with levels of detail, a coarse
 * one of the whole grid and a detailed one where the camera is near
 * (lod.ts); `segments` is the detailed mesh.
 */
export function Terrain({
  fit: next,
  segments,
  lod: levels
}: {
  fit: TerrainFit
  segments: number
  lod: boolean
}) {
  // another track in the same area keeps the loaded map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fit = useMemo(() => next, [next.key])
  const { map, detail, lod } = useMemo(() => {
    const style = currentStyle()
    const coarse = levels ? coarseSegments(segments) : segments
    const create = (tileSegments: number) => {
      const map = new Map({
        source: { api: 'eox' },
        location: fit.location,
        options: {
          // the rectangle of tiles around the route; buildings are cut at it
          grid: fit.grid,
          zoom: fit.zoom,
          tileSize: fit.tileSize,
          tileSegments,
          zScale: fit.zScale,
          imageryZoomOffset: fit.imageryZoom - fit.zoom,
          // half a coarse cell: deeper than the two meshes ever part
          skirt: levels ? (fit.metersPerUnit * fit.tileSize) / coarse / 2 : 0
        },
        material: { process: processor(style), create: terrainMaterial }
      })
      map.addLayer(placeholders)
      return map
    }
    // the same location, zoom and scale: the two maps line up as they are
    const map = create(coarse)
    const detail = levels ? create(segments) : null
    return { map, detail, lod: new TerrainLod(map, detail, complete) }
  }, [fit, segments, levels])
  const look = useSelector(settingsStore, (s) => s.look)
  const theme = useSelector(uiStore, (s) => s.theme)

  useEffect(() => {
    let active = true
    terrainStore.setState((s) => ({
      ...s,
      map,
      surface: lod,
      fit,
      ready: false,
      readyAt: null,
      loaded: 0,
      textured: 0,
      total: fit.columns * fit.rows,
      detailed: detail ? 0 : null,
      heights: null,
      drape: null
    }))
    const finish = () => {
      if (!active) return
      terrainStore.setState((s) =>
        s.map === map
          ? {
              ...s,
              ready: true,
              readyAt: s.readyAt ?? performance.now(),
              revision: s.revision + 1,
              heights: heightRange(map)
            }
          : s
      )
    }
    void map.init(finish)
    // a single stalled tile request must not hold the whole intro back:
    // go on with the tiles that did load; init() refreshes everything later
    let timer = setTimeout(function partial() {
      if (terrainStore.state.ready) return
      if (placedTiles(map).length > 0) finish()
      else timer = setTimeout(partial, PARTIAL_RETRY)
    }, PARTIAL_AFTER)
    // StrictMode runs this twice in development: clean() aborts the first load
    return () => {
      active = false
      clearTimeout(timer)
      map.clean()
      detail?.clean()
      terrainStore.setState((s) =>
        s.map === map
          ? {
              ...s,
              map: null,
              surface: null,
              ready: false,
              detailed: null,
              drape: null
            }
          : s
      )
    }
  }, [map, detail, lod, fit])

  // the look: the tiles' materials are made again from the same textures;
  // only a new processor reloads the imagery
  useEffect(() => {
    const process = processor(LOOK_STYLES[look][theme])
    map.setMaterial({ process })
    detail?.setMaterial({ process })
    invalidate()
  }, [map, detail, look, theme])

  useFeatureLayers(map, detail !== null)
  useFeatureLayers(detail)
  useTerrainBase(map, fit)

  useFrame(({ camera, size }) => {
    const tiles = placedTiles(map)
    const loaded = tiles.length
    const done = tiles.filter((tile) => textured.has(tile)).length
    const state = terrainStore.state
    if (state.map !== map) return
    if (state.loaded !== loaded || state.textured !== done) {
      terrainStore.setState((s) => ({ ...s, loaded, textured: done }))
    }
    // the levels for this camera: what lies on the terrain follows a swap
    if (lod.update(camera as PerspectiveCamera, size.height)) {
      terrainStore.setState((s) => ({
        ...s,
        revision: s.revision + 1,
        detailed: lod.shown.size
      }))
    }
    lod.apply()
  })

  return (
    <>
      <primitive object={map.terrain} />
      {detail && <primitive object={detail.terrain} />}
    </>
  )
}
