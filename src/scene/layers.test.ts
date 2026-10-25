import { LineBasicMaterial, type Material, ShaderLib, Vector4 } from 'three'
import { Map } from 'three-map-terrain'
import { describe, expect, it } from 'vitest'

import { type Feature, FEATURES } from '../state/settings'
import {
  createFeatureLayers,
  drawsFeatures,
  EDGE_DISTANCE,
  EDGE_FADE,
  fadeWithDistance,
  FEATURE_MIN_ZOOM,
  styleFeatures,
  syncFeatures,
  PLANT_SPACING,
  TRUNK_DISTANCE
} from './layers'
import { LOOK_STYLES, WIRE_FILL } from './look'

const WOOD = {
  type: 'Polygon',
  coordinates: [
    [
      [6.63, 46.52],
      [6.64, 46.52],
      [6.64, 46.53],
      [6.63, 46.52]
    ]
  ]
} as const

const all = (shown: boolean) => ({
  buildings: shown,
  roads: shown,
  water: shown,
  vegetation: shown
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
    // plants keep clear of the others' ground
    expect(layers.vegetation.options.avoid).toEqual([
      layers.water,
      layers.roads,
      layers.buildings
    ])
  })

  it('are credited when one shown is drawn at the zoom', () => {
    expect(drawsFeatures(all(true), 9)).toBe(false)
    expect(drawsFeatures(all(true), 10)).toBe(true)
    expect(drawsFeatures({ ...all(false), vegetation: true }, 13)).toBe(false)
    expect(drawsFeatures({ ...all(false), vegetation: true }, 14)).toBe(true)
    expect(drawsFeatures(all(false), 14)).toBe(false)
  })

  it('thin out the far level: sparser woods, outlines of buildings near only', () => {
    const near = createFeatureLayers(LOOK_STYLES.model.dark)
    const far = createFeatureLayers(LOOK_STYLES.model.dark, true)
    const spacing = (layers: typeof near, kind: string) => {
      const { spacing } = layers.vegetation.options
      return typeof spacing === 'number'
        ? spacing
        : spacing(14, { kind, geometry: WOOD, properties: {} })
    }
    expect(spacing(near, 'forest')).toBe(PLANT_SPACING.detail.tree)
    expect(spacing(near, 'scrub')).toBe(PLANT_SPACING.detail.bush)
    expect(spacing(far, 'wood')).toBe(PLANT_SPACING.coarse.tree)
    expect(spacing(far, 'scrub')).toBe(PLANT_SPACING.coarse.bush)
    const distance = near.buildings.maxDistance
    expect(typeof distance).toBe('function')
    if (typeof distance === 'function') {
      expect(distance('edges')).toBe(EDGE_DISTANCE)
      expect(distance('walls')).toBeUndefined()
    }
  })

  it('hide the trunks of trees far from the camera, never the crowns', () => {
    const { vegetation } = createFeatureLayers(LOOK_STYLES.model.dark)
    const distance = vegetation.maxDistance
    expect(typeof distance).toBe('function')
    if (typeof distance === 'function') {
      expect(distance('trunks')).toBe(TRUNK_DISTANCE)
      expect(distance('crowns')).toBeUndefined()
      expect(distance('bushes')).toBeUndefined()
    }
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
    // woods are their outlines: no fill under them
    expect(look('vegetation')).toMatchObject({
      wireframe: true,
      fillOpacity: 0
    })
    // the base keeps its walls
    expect(map.materialOptions.wireframe).toBe(false)

    styleFeatures(layers, LOOK_STYLES.model.dark)
    expect(look('vegetation')).toMatchObject({
      wireframe: false,
      color: LOOK_STYLES.model.dark.vegetation
    })
  })

  it('hide the outlines of buildings far over solid walls only: in lines they are the buildings', () => {
    const layers = createFeatureLayers(LOOK_STYLES.wireframe.dark)
    expect(layers.buildings.maxDistance).toBeUndefined()
    styleFeatures(layers, LOOK_STYLES.photo.dark)
    const distance = layers.buildings.maxDistance
    expect(typeof distance).toBe('function')
    if (typeof distance === 'function')
      expect(distance('edges')).toBe(EDGE_DISTANCE)
    styleFeatures(layers, LOOK_STYLES.wireframe.light)
    expect(layers.buildings.maxDistance).toBeUndefined()
  })

  it('fade the outlines of buildings with the distance, and thicken their fill in lines', () => {
    const map = new Map({ location: { lat: 46.52, lon: 6.63 } })
    const layers = createFeatureLayers(LOOK_STYLES.wireframe.dark)
    syncFeatures(map, layers, all(true))
    const material = (kind: 'faces' | 'lines', wireframe: boolean) =>
      (
        layers.buildings as unknown as {
          createMaterial: (
            part: string,
            kind: 'faces' | 'lines',
            look: object
          ) => Material
        }
      ).createMaterial(kind === 'lines' ? 'edges' : 'walls', kind, {
        wireframe,
        fillOpacity: WIRE_FILL
      })
    const fades = (m: Material) => m.customProgramCacheKey() === 'distance-fade'

    expect(fades(material('lines', true))).toBe(true)
    expect(fades(material('faces', true))).toBe(true)
    // over solid walls: the outlines fade, the walls stay
    expect(fades(material('lines', false))).toBe(true)
    expect(fades(material('faces', false))).toBe(false)
    expect(material('faces', false).transparent).toBe(false)
  })

  it('fade a material in the shaders of three.js', () => {
    for (const lib of [ShaderLib.basic, ShaderLib.lambert]) {
      const material = new LineBasicMaterial()
      fadeWithDistance(material, EDGE_FADE.wireframe, 2.5)
      const shader = {
        uniforms: {} as Record<string, { value: unknown }>,
        vertexShader: lib.vertexShader,
        fragmentShader: lib.fragmentShader
      }
      material.onBeforeCompile(
        shader as unknown as Parameters<Material['onBeforeCompile']>[0],
        {} as Parameters<Material['onBeforeCompile']>[1]
      )
      expect(material.transparent).toBe(true)
      const { from, to, opacity } = EDGE_FADE.wireframe
      expect(shader.uniforms.fade.value).toEqual(
        new Vector4(from, to, opacity, 2.5)
      )
      expect(shader.vertexShader).toContain(
        'vFadeMeters = length( mvPosition.xyz ) * fade.w;'
      )
      expect(shader.fragmentShader).toContain(
        'mix( opacity, fade.z, smoothstep( fade.x, fade.y, vFadeMeters ) )'
      )
    }
  })
})
