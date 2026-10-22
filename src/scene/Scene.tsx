import { Canvas } from '@react-three/fiber'
import { useSelector } from '@tanstack/react-store'

import { t } from '../i18n'
import { settingsStore } from '../state/settings'
import { CameraRig } from './CameraRig'
import {
  Environment,
  PerfProbe,
  PlaybackDriver,
  RenderOnDemand
} from './Environment'
import { PointerProbe } from './Probes'
import { World } from './World'

/**
 * Multisampling only where pixels are large: on a 2× screen edges are smooth
 * already, and the samples of a buffer that size cost the most.
 */
const ANTIALIAS = window.devicePixelRatio < 2

export function Scene() {
  const pixelSize = useSelector(settingsStore, (s) => s.pixelSize)
  // pixel mode renders fewer pixels and lets CSS scale them up without smoothing
  const dpr =
    pixelSize > 1 ? 1 / pixelSize : Math.min(window.devicePixelRatio, 2)

  return (
    <Canvas
      className='scene'
      data-pixelated={pixelSize > 1}
      dpr={dpr}
      // frames only when something changes: see RenderOnDemand
      frameloop='demand'
      flat
      gl={{
        antialias: ANTIALIAS,
        alpha: true,
        powerPreference: 'high-performance'
      }}
      camera={{
        fov: 45,
        near: 1,
        far: 1e5,
        up: [0, 0, 1],
        position: [0, -1800, 2400]
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
        // focusable, so that arrow keys reach the controls
        gl.domElement.tabIndex = 0
        gl.domElement.setAttribute('aria-label', t('app.scene'))
      }}
    >
      <RenderOnDemand />
      <Environment />
      <CameraRig />
      <World />
      <PointerProbe />
      <PlaybackDriver />
      <PerfProbe />
    </Canvas>
  )
}
