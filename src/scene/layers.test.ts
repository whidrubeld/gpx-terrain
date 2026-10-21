import { Map } from 'three-map-terrain'
import { describe, expect, it } from 'vitest'

import { type Feature, FEATURES } from '../state/settings'
import {
  createFeatureLayers,
  drawsFeatures,
  FEATURE_MIN_ZOOM,
  styleFeatures,
  syncFeatures
} from './layers'
import { LOOK_STYLES, WIRE_FILL } from './look'

const all = (shown: boolean) => ({
  buildings: shown,
  roads: shown,
  water: shown,
  trees: shown
})

describe('map features', () => {
  it('join the map the first time they are shown, and only hide after that', () => {
    const map = new Map({ location: { lat: 46.52, lon: 6.63 } })
    const layers = createFeatureLayers(LOOK_STYLES.model.dark)

    syncFeatures(map, layers, { ...all(false), roads: true })
    expect(map.layers).toEqual([layers.roads])
    expect(layers.roads.group.visible).toBe(true)
    expect(layers.water.group.visible).toBe(false)

    syncFeatures(map, layers, all(false))
    expect(map.layers).toEqual([layers.roads])
    expect(layers.roads.group.visible).toBe(false)

    syncFeatures(map, layers, all(true))
    expect(map.layers).toHaveLength(4)
    expect(FEATURES.map((feature) => layers[feature].group.visible)).toEqual([
      true,
      true,
      true,
      true
    ])
  })

  it('draw from the zoom the library can', () => {
    const layers = createFeatureLayers(LOOK_STYLES.model.dark)
    for (const [feature, zoom] of Object.entries(FEATURE_MIN_ZOOM)) {
      expect(layers[feature as Feature].minZoom).toBe(zoom)
    }
    // trees keep clear of the others' ground
    expect(layers.trees.options.avoid).toEqual([
      layers.water,
      layers.roads,
      layers.buildings
    ])
  })

  it('are credited when one shown is drawn at the zoom', () => {
    expect(drawsFeatures(all(true), 9)).toBe(false)
    expect(drawsFeatures(all(true), 10)).toBe(true)
    expect(drawsFeatures({ ...all(false), trees: true }, 13)).toBe(false)
    expect(drawsFeatures({ ...all(false), trees: true }, 14)).toBe(true)
    expect(drawsFeatures(all(false), 14)).toBe(false)
  })
})

describe('the looks of the map features', () => {
  it('outline them over a light fill in lines, and keep the map solid', () => {
    const map = new Map({ location: { lat: 46.52, lon: 6.63 } })
    const layers = createFeatureLayers(LOOK_STYLES.photo.dark)
    syncFeatures(map, layers, all(true))
    const look = (feature: Feature) =>
      (layers[feature] as unknown as { look: Record<string, unknown> }).look

    styleFeatures(layers, LOOK_STYLES.wireframe.light)
    expect(look('water')).toMatchObject({
      wireframe: true,
      fillOpacity: WIRE_FILL,
      color: LOOK_STYLES.wireframe.light.water
    })
    // the base keeps its walls
    expect(map.materialOptions.wireframe).toBe(false)

    styleFeatures(layers, LOOK_STYLES.model.dark)
    expect(look('trees')).toMatchObject({
      wireframe: false,
      color: LOOK_STYLES.model.dark.trees
    })
  })
})
