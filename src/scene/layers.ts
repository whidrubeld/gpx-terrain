import { shallow, useSelector } from '@tanstack/react-store'
import { useEffect, useMemo } from 'react'
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
import { LOOK_STYLES, type LookStyle } from './look'

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
 * The OpenStreetMap features of one map in the colors of a look, from
 * OpenFreeMap's vector tiles: no key, and a tile is downloaded once for all
 * four. Trees keep clear of the ground of the others — also while those are
 * hidden. In lines, water and trees stay solid: a lake or a wood in lines
 * would be lost in the terrain's.
 */
export function createFeatureLayers(style: LookStyle): FeatureLayers {
  const source = { api: 'openfreemap' } as const
  const solid = style.wireframe ? { wireframe: false } : {}
  const buildings = new Buildings({
    source,
    edges: true,
    minZoom: FEATURE_MIN_ZOOM.buildings,
    material: { color: style.buildings }
  })
  const roads = new Roads({
    source,
    minZoom: FEATURE_MIN_ZOOM.roads,
    material: { color: style.roads }
  })
  const water = new Water({
    source,
    minZoom: FEATURE_MIN_ZOOM.water,
    material: { color: style.water, ...solid }
  })
  const trees = new Trees({
    source,
    avoid: [water, roads, buildings],
    minZoom: FEATURE_MIN_ZOOM.trees,
    material: { color: style.trees, ...solid }
  })
  return { buildings, roads, water, trees }
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
}

/**
 * The map features of the settings on `map`. A layer's colors are fixed
 * when it is made: another look or theme makes new ones, which read their
 * tiles again from the HTTP cache.
 */
export function useFeatureLayers(map: Map) {
  const look = useSelector(settingsStore, (s) => s.look)
  const theme = useSelector(uiStore, (s) => s.theme)
  const layers = useMemo(
    () => createFeatureLayers(LOOK_STYLES[look][theme]),
    // a layer belongs to one map: new ones for every map
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, look, theme]
  )
  const shown = useSelector(settingsStore, shownFeatures, { compare: shallow })

  useEffect(
    () => () => {
      for (const feature of FEATURES) map.removeLayer(layers[feature])
    },
    [map, layers]
  )
  useEffect(() => {
    syncFeatures(map, layers, shown)
  }, [map, layers, shown])
}

/**
 * Closes the terrain into a block (a diorama) with the library's
 * `TerrainBase`, which follows the tiles as they load. Its color is fixed
 * when it is made: another look or theme makes another one.
 */
export function useTerrainBase(map: Map, fit: TerrainFit) {
  const shown = useSelector(settingsStore, (s) => s.base)
  const look = useSelector(settingsStore, (s) => s.look)
  const theme = useSelector(uiStore, (s) => s.theme)

  const base = useMemo(
    () =>
      new TerrainBase({
        // a twenty-fifth of a tile below the lowest point
        depth: fit.metersPerUnit * fit.tileSize * 0.04,
        material: { color: LOOK_STYLES[look][theme].base }
      }),
    [fit, look, theme]
  )

  useEffect(() => {
    map.addLayer(base)
    return () => map.removeLayer(base)
  }, [map, base])

  useEffect(() => {
    base.group.visible = shown
  }, [base, shown])
}
