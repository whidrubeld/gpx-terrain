import { useFrame, useThree } from '@react-three/fiber'
import { useSelector } from '@tanstack/react-store'
import { useEffect, useMemo } from 'react'
import { Group } from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

import { indexAtProgress } from '../gpx/track'
import {
  type Drape,
  playbackStore,
  terrainStore,
  uiStore,
  viewerStore
} from '../state/viewer'
import { lineVertexAt } from './drape'
import {
  easeInOutCubic,
  INTRO,
  introPhase,
  PALETTE,
  type Palette
} from './look'

/**
 * Share of its distance from the camera by which the route is drawn nearer,
 * along the line of sight: where it shows on screen does not change, but it
 * stays in front of the surface it lies on (and of roads, drawn flush on
 * it) without being lifted off it. Hills and buildings still hide it.
 */
const PULL = 0.003

/** A `LineMaterial` whose lines are pulled towards the camera by `PULL`. */
function pulled(material: LineMaterial) {
  const end = 'vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      end,
      `${end}\n\tstart.xyz *= ${1 - PULL};\n\tend.xyz *= ${1 - PULL};`
    )
  }
  material.customProgramCacheKey = () => 'route-pulled'
  return material
}

/**
 * The route as screen-space fat lines (`Line2`), drawn in layers:
 * x-ray (through the terrain, faint) → halo → remaining part → travelled part.
 * Drawing progress is `instanceCount`: one instance per segment.
 */
class RouteLines {
  readonly group = new Group()
  private readonly all = new LineGeometry()
  private readonly travelled = new LineGeometry()
  private readonly materials: Record<
    'xray' | 'halo' | 'rest' | 'done',
    LineMaterial
  >
  readonly segments: number

  constructor(drape: Drape) {
    this.all.setPositions(drape.line)
    this.travelled.setPositions(drape.line)
    this.segments = drape.line.length / 3 - 1

    const material = (linewidth: number, opacity: number, depthTest = true) =>
      pulled(
        new LineMaterial({
          linewidth,
          transparent: true,
          opacity,
          depthTest,
          depthWrite: false
        })
      )
    this.materials = {
      xray: material(1.5, 0.22, false),
      halo: material(6, 0.55),
      rest: material(2, 0.5),
      done: material(3, 1)
    }
    const layers = [
      new Line2(this.all, this.materials.xray),
      new Line2(this.all, this.materials.halo),
      new Line2(this.all, this.materials.rest),
      new Line2(this.travelled, this.materials.done)
    ]
    layers.forEach((line, order) => {
      line.renderOrder = 10 + order
      line.raycast = () => undefined
      this.group.add(line)
    })
    this.group.name = 'route'
  }

  setPalette(palette: Palette) {
    this.materials.xray.color.set(palette.fg)
    this.materials.halo.color.set(palette.halo)
    this.materials.rest.color.set(palette.fg)
    this.materials.done.color.set(palette.fg)
  }

  setResolution(width: number, height: number) {
    for (const material of Object.values(this.materials))
      material.resolution.set(width, height)
  }

  /** Shows the first `revealed` segments, `travelled` of them bright. */
  draw(revealed: number, travelled: number) {
    this.all.instanceCount = revealed
    this.travelled.instanceCount = Math.min(revealed, travelled)
  }

  dispose() {
    this.all.dispose()
    this.travelled.dispose()
    for (const material of Object.values(this.materials)) material.dispose()
  }
}

export function Route() {
  const drape = useSelector(terrainStore, (s) => s.drape)
  const theme = useSelector(uiStore, (s) => s.theme)
  const size = useThree((s) => s.size)

  const lines = useMemo(() => (drape ? new RouteLines(drape) : null), [drape])
  useEffect(() => () => lines?.dispose(), [lines])
  useEffect(() => lines?.setPalette(PALETTE[theme]), [lines, theme])
  useEffect(() => lines?.setResolution(size.width, size.height), [lines, size])

  useFrame(() => {
    const track = viewerStore.state.track
    if (!lines || !drape || !track) return
    const reveal = easeInOutCubic(introPhase(INTRO.route))
    const index = indexAtProgress(track, playbackStore.state.progress)
    lines.draw(
      Math.round(reveal * lines.segments),
      Math.round(lineVertexAt(drape, index))
    )
  })

  return lines ? <primitive object={lines.group} /> : null
}
