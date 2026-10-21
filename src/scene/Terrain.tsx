import { useFrame } from '@react-three/fiber'
import { useSelector } from '@tanstack/react-store'
import { useEffect, useMemo } from 'react'
import { MeshNormalMaterial } from 'three'
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

/** The bare relief instead of the library's rainbow placeholder while imagery loads. */
const placeholders: MapLayer = {
  tileLoaded(tile) {
    if (!(tile.mesh.material instanceof MeshNormalMaterial)) return
    tile.mesh.material = terrainMaterial({
      texture: null,
      tile,
      options: tile.map.materialOptions
    })
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

export function Terrain({
  fit: next,
  segments
}: {
  fit: TerrainFit
  segments: number
}) {
  // another track in the same area keeps the loaded map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fit = useMemo(() => next, [next.key])
  const map = useMemo(() => {
    const style = currentStyle()
    const map = new Map({
      source: { api: 'eox' },
      location: fit.location,
      options: {
        nTiles: fit.nTiles,
        zoom: fit.zoom,
        tileSize: fit.tileSize,
        tileSegments: segments,
        zScale: fit.zScale
      },
      material: { process: processor(style), create: terrainMaterial }
    })
    map.addLayer(placeholders)
    return map
  }, [fit, segments])
  const look = useSelector(settingsStore, (s) => s.look)
  const theme = useSelector(uiStore, (s) => s.theme)

  useEffect(() => {
    let active = true
    terrainStore.setState((s) => ({
      ...s,
      map,
      fit,
      ready: false,
      readyAt: null,
      loaded: 0,
      textured: 0,
      total: fit.nTiles ** 2,
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
      terrainStore.setState((s) =>
        s.map === map ? { ...s, map: null, ready: false, drape: null } : s
      )
    }
  }, [map, fit])

  // the look: the tiles' materials are made again from the same textures;
  // only a new processor reloads the imagery
  useEffect(() => {
    map.setMaterial({ process: processor(LOOK_STYLES[look][theme]) })
  }, [map, look, theme])

  useFeatureLayers(map)
  useTerrainBase(map, fit)

  useFrame(() => {
    const tiles = placedTiles(map)
    const loaded = tiles.length
    const done = tiles.filter((tile) => textured.has(tile)).length
    const state = terrainStore.state
    if (
      state.map === map &&
      (state.loaded !== loaded || state.textured !== done)
    ) {
      terrainStore.setState((s) => ({ ...s, loaded, textured: done }))
    }
  })

  return <primitive object={map.terrain} />
}
