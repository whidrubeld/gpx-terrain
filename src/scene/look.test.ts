import { Color, PerspectiveCamera, SRGBColorSpace } from 'three'
import { MapControls } from 'three/addons/controls/MapControls.js'
import { describe, expect, it } from 'vitest'

import { FEATURES } from '../state/settings'
import { frameStep, LOOK_STYLES, monochrome } from './look'

describe('the dark model', () => {
  it('steps from the ground to the roads to the buildings, none glaring', () => {
    const { terrain, roads, buildings } = LOOK_STYLES.model.dark
    const lightness = (color: string) =>
      new Color(color).getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace).l
    expect(lightness(roads)).toBeGreaterThan(lightness(terrain) + 0.05)
    expect(lightness(buildings)).toBeGreaterThan(lightness(roads) + 0.05)
    // the white route stays the brightest
    expect(lightness(buildings)).toBeLessThan(0.65)
  })
})

describe('lines', () => {
  it('give every feature a muted color: none outshines the route', () => {
    for (const style of Object.values(LOOK_STYLES.wireframe)) {
      for (const feature of FEATURES) {
        const { r, g, b } = new Color(style[feature]).getRGB(
          { r: 0, g: 0, b: 0 },
          SRGBColorSpace
        )
        // chroma: how far from a gray
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(0.3)
      }
    }
  })
})

describe('frameStep', () => {
  it('passes ordinary frames through', () => {
    expect(frameStep(1 / 60)).toBe(1 / 60)
    expect(frameStep(0)).toBe(0)
  })

  it('does not let auto-rotate catch up after the tab was hidden', () => {
    const camera = new PerspectiveCamera()
    camera.position.set(0, -100, 100)
    const controls = new MapControls(camera)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.5
    controls.update(0)

    // the first frame after 100 s away, then damping settles without new turns
    const start = controls.getAzimuthalAngle()
    let previous = start
    let turned = 0
    for (const delta of [100, ...Array<number>(200).fill(0)]) {
      controls.update(frameStep(delta))
      const azimuth = controls.getAzimuthalAngle()
      turned += Math.atan2(
        Math.sin(azimuth - previous),
        Math.cos(azimuth - previous)
      )
      previous = azimuth
    }

    // what 0.1 s of rotation turns, not 100 s (5.2 rad, most of a turn)
    const perSecond = ((2 * Math.PI) / 60) * controls.autoRotateSpeed
    expect(Math.abs(turned)).toBeCloseTo(perSecond * 0.1, 4)
  })
})

describe('monochrome', () => {
  it('turns the imagery gray, with a little more contrast', async () => {
    // pure red, a mid gray and white, in a stand-in for a 2D context
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 118, 118, 118, 255, 255, 255, 255, 255
    ])
    const image = { data, width: 3, height: 1 } as ImageData
    let written: ImageData | undefined
    const context = {
      getImageData: () => image,
      putImageData: (next: ImageData) => (written = next)
    } as unknown as CanvasRenderingContext2D
    await monochrome(context, { width: 3, height: 1, z: 0, x: 0, y: 0 })
    expect(written).toBe(image)
    expect([...data]).toEqual([
      48, 48, 48, 255, 128, 128, 128, 255, 255, 255, 255, 255
    ])
  })
})
