import { PerspectiveCamera } from 'three'
import { MapControls } from 'three/addons/controls/MapControls.js'
import { describe, expect, it } from 'vitest'

import { frameStep } from './look'

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
