import { useFrame, useThree } from '@react-three/fiber'
import { useSelector } from '@tanstack/react-store'
import { useEffect } from 'react'
import { FogExp2 } from 'three'

import { gridSize } from '../lib/fit'
import { settingsStore } from '../state/settings'
import {
  hoverStore,
  PLAYBACK_SECONDS,
  playbackStore,
  terrainStore,
  uiStore,
  viewerStore
} from '../state/viewer'
import { frameStep, introPlaying, PALETTE } from './look'
import { perf } from './perf'

/** Lights (sun from the north-west, the cartographic convention) and fog. */
export function Environment() {
  const scene = useThree((s) => s.scene)
  const theme = useSelector(uiStore, (s) => s.theme)
  const fog = useSelector(settingsStore, (s) => s.fog)
  const fit = useSelector(terrainStore, (s) => s.fit)
  const extent = fit ? gridSize(fit) : 1800

  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    // the canvas is transparent: fog fades the terrain into the page color
    scene.fog = fog ? new FogExp2(PALETTE[theme].bg, 0.3 / extent) : null
    invalidate()
    return () => {
      scene.fog = null
    }
  }, [scene, theme, fog, extent, invalidate])

  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[-1e4, 1e4, 1.3e4]} intensity={2.6} />
    </>
  )
}

/** Frames further apart were not a run of frames: the scene was still. */
const STILL = 0.25

/**
 * The scene renders on demand (`frameloop='demand'`): a still terrain costs
 * nothing — no frames, and nothing for the browser to composite under the
 * panels. A frame is asked for by every store change, by the controls
 * (`CameraRig`), the pointer (`PointerProbe`), the tiles and the layers as
 * they load (`Terrain`, `layers.ts`), and by what moves on its own: the
 * intro, playback, flights and easing, which ask for the next frame while
 * they last. Until the grid is ready, every frame asks for the next.
 */
export function RenderOnDemand() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const stores = [
      settingsStore,
      uiStore,
      viewerStore,
      terrainStore,
      hoverStore,
      playbackStore
    ] as const
    const subscriptions = stores.map((store) =>
      store.subscribe(() => {
        invalidate()
      })
    )
    return () => {
      for (const subscription of subscriptions) subscription.unsubscribe()
    }
  }, [invalidate])
  useFrame(() => {
    const { map, ready } = terrainStore.state
    if ((map && !ready) || introPlaying() || playbackStore.state.playing)
      invalidate()
  })
  return null
}

export function PerfProbe() {
  useFrame((state, delta) => {
    // the frame times of runs of frames, not the pauses between them
    if (delta < STILL) {
      perf.frames[perf.head] = delta * 1000
      perf.head = (perf.head + 1) % perf.frames.length
      perf.count = Math.min(perf.count + 1, perf.frames.length)
    }
    // read before this frame renders: the numbers of the previous frame
    const { render, memory, programs } = state.gl.info
    perf.calls = render.calls
    perf.triangles = render.triangles
    perf.points = render.points
    perf.lines = render.lines
    perf.geometries = memory.geometries
    perf.textures = memory.textures
    perf.programs = programs?.length ?? 0
    perf.dpr = state.viewport.dpr
    perf.width = state.size.width
    perf.height = state.size.height
  })
  return null
}

/** Advances the playhead: the whole track takes `PLAYBACK_SECONDS / speed`. */
export function PlaybackDriver() {
  useFrame((_, delta) => {
    const { playing, progress, speed } = playbackStore.state
    if (!playing || !viewerStore.state.track) return
    const next = Math.min(
      1,
      progress + (frameStep(delta) * speed) / PLAYBACK_SECONDS
    )
    playbackStore.setState((s) => ({ ...s, progress: next, playing: next < 1 }))
  })
  return null
}
