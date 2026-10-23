import { invalidate } from '@react-three/fiber'
import { shallow, useSelector } from '@tanstack/react-store'
import { useEffect, useMemo } from 'react'
import { Color, MeshBasicMaterial } from 'three'
import {
  Buildings,
  type Map,
  Roads,
  TerrainBase,
  Trees,
  Water
} from 'three-map-terrain'

import type { TerrainFit } from '../lib/fit'
import {
  type Feature,
  FEATURES,
  type FeatureSet,
  settingsStore,
  shownFeatures
} from '../state/settings'
import { uiStore } from '../state/viewer'
import {
  LOOK_STYLES,
  type LookStyle,
  PALETTE,
  type Palette,
  wireFill
} from './look'

/**
 * Zoom of the terrain from which each feature is drawn — the library's
 * defaults. A 3 × 3 grid is about 5 km wide at zoom 14, 10 km at 13.
 */
export const FEATURE_MIN_ZOOM: Readonly<Record<Feature, number>> = {
  buildings: 13,
  roads: 12,
  water: 10,
  trees: 14
}

/** Whether a feature of `shown` is drawn at `zoom`: then its data needs credit. */
export const drawsFeatures = (shown: Readonly<FeatureSet>, zoom: number) =>
  FEATURES.some(
    (feature) => shown[feature] && zoom >= FEATURE_MIN_ZOOM[feature]
  )

export interface FeatureLayers {
  readonly buildings: Buildings
  readonly roads: Roads
  readonly water: Water
  readonly trees: Trees
}

/**
 * A feature's look in a style: its color, and in lines its outline over a
 * light fill. The map's own look stays solid — the terrain's lines are drawn
 * by its material (Terrain.tsx), and the base keeps its walls.
 */
const featureLook = (style: LookStyle, feature: Feature) => ({
  color: style[feature],
  wireframe: style.wireframe,
  fillOpacity: style.wireframe ? wireFill(feature) : 0
})

/**
 * Meters from the camera beyond which the trunks of trees are hidden:
 * thinner than a pixel there, and under the crowns.
 */
export const TRUNK_DISTANCE = 1200

/** …and the outlines of buildings: a haze of lines farther away. */
export const EDGE_DISTANCE = 3000

/**
 * Meters between the trees of a wood: the library's default — and sparser
 * on the coarse level of detail, which the camera only sees from afar.
 */
export const TREE_SPACING = { detail: 9, coarse: 14 } as const

/**
 * The OpenStreetMap features of one map, from OpenFreeMap's vector tiles: no
 * key, and a tile is downloaded once for all four. Trees keep clear of the
 * ground of the others — also while those are hidden.
 */
export function createFeatureLayers(
  style: LookStyle,
  coarse = false
): FeatureLayers {
  const source = { api: 'openfreemap' } as const
  const buildings = new Buildings({
    source,
    edges: true,
    maxDistance: (part) => (part === 'edges' ? EDGE_DISTANCE : undefined),
    minZoom: FEATURE_MIN_ZOOM.buildings,
    material: featureLook(style, 'buildings')
  })
  const roads = new Roads({
    source,
    minZoom: FEATURE_MIN_ZOOM.roads,
    material: featureLook(style, 'roads')
  })
  const water = new Water({
    source,
    minZoom: FEATURE_MIN_ZOOM.water,
    material: featureLook(style, 'water')
  })
  const trees = new Trees({
    source,
    spacing: coarse ? TREE_SPACING.coarse : TREE_SPACING.detail,
    avoid: [water, roads, buildings],
    maxDistance: (part) => (part === 'trunks' ? TRUNK_DISTANCE : undefined),
    minZoom: FEATURE_MIN_ZOOM.trees,
    material: featureLook(style, 'trees')
  })
  return { buildings, roads, water, trees }
}

/** Another look or theme: the layers' materials change, not their geometry. */
export function styleFeatures(layers: FeatureLayers, style: LookStyle) {
  for (const feature of FEATURES)
    layers[feature].setMaterial(featureLook(style, feature))
  invalidate()
}

/**
 * Shows the features in `shown`. A layer joins the map the first time it is
 * shown — a feature never shown is never downloaded — and is only hidden
 * after that, so that it comes back at once.
 */
export function syncFeatures(
  map: Map,
  layers: FeatureLayers,
  shown: Readonly<FeatureSet>
) {
  for (const feature of FEATURES) {
    const layer = layers[feature]
    if (shown[feature] && !map.layers.includes(layer)) map.addLayer(layer)
    layer.group.visible = shown[feature]
  }
  invalidate()
}

/**
 * The map features of the settings on `map`, in the colors of the look —
 * every map its own (levels of detail have two; `coarse`: the map of the
 * far level); none without a map. A tile they draw asks for a frame.
 */
export function useFeatureLayers(map: Map | null, coarse = false) {
  const look = useSelector(settingsStore, (s) => s.look)
  const theme = useSelector(uiStore, (s) => s.theme)
  const layers = useMemo(
    () =>
      map &&
      createFeatureLayers(
        LOOK_STYLES[settingsStore.state.look][uiStore.state.theme],
        coarse
      ),
    // a layer belongs to one map: new ones for every map
    [map, coarse]
  )
  const shown = useSelector(settingsStore, shownFeatures, { compare: shallow })

  useEffect(() => {
    if (!map || !layers) return
    const stops = FEATURES.map((feature) =>
      layers[feature].onTileDrawn(() => {
        invalidate()
      })
    )
    return () => {
      for (const stop of stops) stop()
      for (const feature of FEATURES) map.removeLayer(layers[feature])
    }
  }, [map, layers])
  useEffect(() => {
    if (layers) styleFeatures(layers, LOOK_STYLES[look][theme])
  }, [layers, look, theme])
  useEffect(() => {
    if (map && layers) syncFeatures(map, layers, shown)
  }, [map, layers, shown])
}

/** Scene units between the dots of the base's walls. */
const DOT_SPACING = 8

/**
 * The walls of the base: the theme's wall color with a dot of its edge color
 * every `DOT_SPACING` units along them and up — a pixel pattern, like the
 * page's. The base's geometry has no UVs: the dots follow its position.
 */
function dottedWalls(palette: Palette) {
  const material = new MeshBasicMaterial({
    color: palette.wall,
    // in front of the skirts of levels of detail, which hang in its planes
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  })
  const ink = { value: new Color(palette.edge) }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.ink = ink
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'varying vec3 vWall;\nvarying vec3 vWallNormal;\nvoid main() {'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvWall = position;\n\tvWallNormal = normal;'
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 ink;\nvarying vec3 vWall;\nvarying vec3 vWallNormal;\nvoid main() {'
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
\t// along the wall (walls face x or y) and up
\tvec2 cell = fract( vec2( abs( vWallNormal.x ) > 0.5 ? vWall.y : vWall.x, vWall.z ) / ${DOT_SPACING.toFixed(1)} );
\tif ( cell.x < 0.25 && cell.y < 0.25 ) diffuseColor.rgb = ink;`
      )
  }
  material.customProgramCacheKey = () => 'dotted-walls'
  return material
}

/**
 * Closes the terrain into a block (a diorama) with the library's
 * `TerrainBase`, which follows the tiles as they load: dotted walls, and
 * their outline — the terrain's profile, the bottom, the corners — over
 * them, in every look.
 */
export function useTerrainBase(map: Map, fit: TerrainFit) {
  const shown = useSelector(settingsStore, (s) => s.base)
  const theme = useSelector(uiStore, (s) => s.theme)

  const base = useMemo(() => {
    const palette = PALETTE[theme]
    // a twenty-fifth of a tile below the lowest point
    const depth = fit.metersPerUnit * fit.tileSize * 0.04
    const walls = dottedWalls(palette)
    return {
      walls: new TerrainBase({ depth, material: walls }),
      outline: new TerrainBase({
        depth,
        material: { wireframe: true, color: palette.edge }
      }),
      // ours: the base leaves it
      material: walls
    }
  }, [fit, theme])

  useEffect(() => {
    map.addLayer(base.walls)
    map.addLayer(base.outline)
    return () => {
      map.removeLayer(base.walls)
      map.removeLayer(base.outline)
      base.material.dispose()
    }
  }, [map, base])

  useEffect(() => {
    base.walls.group.visible = shown
    base.outline.group.visible = shown
    invalidate()
  }, [base, shown])
}
