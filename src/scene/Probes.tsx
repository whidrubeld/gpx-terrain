import { useFrame, useThree } from '@react-three/fiber'
import { useSelector } from '@tanstack/react-store'
import { useEffect, useMemo, useRef } from 'react'
import { type Camera, type Group, Raycaster, Vector2, Vector3 } from 'three'
import type { GeoLocation } from 'three-map-terrain'

import {
  indexAtProgress,
  progressAtIndex,
  sampleTrack,
  type Track
} from '../gpx/track'
import { useT } from '../i18n'
import {
  distanceParts,
  elevationParts,
  formatClock,
  formatCount,
  formatDuration,
  formatLat,
  formatLon,
  gradeParts,
  joinParts,
  speedParts
} from '../lib/format'
import {
  hoverStore,
  playbackStore,
  seek,
  setHoverIndex,
  terrainStore,
  uiStore,
  viewerStore
} from '../state/viewer'
import { lineAt } from './drape'
import { Glyphs, Label } from './Glyphs'
import { sceneRefs } from './refs'

const ORIGIN = new Float32Array(3)

// ------------------------------------------------------------ hover

/** Room the point card needs above its point, CSS px. */
const CARD_HEIGHT = 250

export function HoverProbe() {
  const index = useSelector(hoverStore, (s) => s.index)
  const drape = useSelector(terrainStore, (s) => s.drape)
  const fit = useSelector(terrainStore, (s) => s.fit)
  const track = useSelector(viewerStore, (s) => s.track)
  const camera = useThree((s) => s.camera)
  const height = useThree((s) => s.size.height)
  const position = useMemo(
    () => (drape && index !== null ? lineAt(drape, index) : null),
    [drape, index]
  )
  // near the top of the canvas the card opens downwards, clear of the top bar
  const placement = useMemo(() => {
    const world = sceneRefs.world
    if (!position || !world) return 'above'
    const screen = world
      .localToWorld(new Vector3(position.x, position.y, position.z))
      .project(camera)
    const y = ((1 - screen.y) / 2) * height
    return y < uiStore.state.insets.top + CARD_HEIGHT ? 'below' : 'above'
  }, [position, camera, height])
  if (!position || !track || !fit || index === null) return null

  return (
    <group position={[position.x, position.y, position.z]}>
      <Glyphs name='hover' positions={ORIGIN} />
      <Label
        position={[0, 0, placement === 'above' ? fit.tileSize * 0.04 : 0]}
        placement={placement}
      >
        <SampleCard track={track} index={index} />
      </Label>
    </group>
  )
}

export function SampleCard({ track, index }: { track: Track; index: number }) {
  const t = useT()
  const sample = sampleTrack(track, index)
  const start = track.times?.[0] ?? null
  const rows: [string, string][] = [
    [t('point.distance'), joinParts(distanceParts(sample.distance))],
    [t('point.elevation'), joinParts(elevationParts(sample.ele))],
    [t('point.grade'), joinParts(gradeParts(sample.grade))]
  ]
  if (sample.time !== null && start !== null) {
    rows.push(
      [t('point.time'), formatClock(sample.time)],
      [t('point.elapsed'), formatDuration(sample.time - start)]
    )
  }
  if (sample.speed !== null)
    rows.push([t('point.speed'), joinParts(speedParts(sample.speed))])
  if (sample.hr !== null)
    rows.push([t('point.hr'), `${Math.round(sample.hr)} ${t('units.bpm')}`])
  rows.push(
    [t('point.lat'), formatLat(sample.lat)],
    [t('point.lon'), formatLon(sample.lon)]
  )

  return (
    <div className='card w-52 -translate-y-1'>
      <div className='card-title flex justify-between'>
        <span>{t('point.title')}</span>
        <span className='text-muted tabular-nums'>
          {formatCount(Math.round(sample.index) + 1)}/
          {formatCount(track.points.length)}
        </span>
      </div>
      <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5'>
        {rows.map(([key, value]) => (
          <div key={key} className='contents'>
            <dt className='text-muted'>{key}</dt>
            <dd className='text-right tabular-nums'>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ------------------------------------------------------------ playhead

export function Playhead() {
  const drape = useSelector(terrainStore, (s) => s.drape)
  const fit = useSelector(terrainStore, (s) => s.fit)
  const group = useRef<Group>(null)
  const text = useRef<HTMLSpanElement>(null)

  useFrame(() => {
    const track = viewerStore.state.track
    const node = group.current
    if (!node || !drape || !track) return
    const { progress, playing } = playbackStore.state
    node.visible = playing || (progress > 0 && progress < 1)
    if (!node.visible) return
    const index = indexAtProgress(track, progress)
    lineAt(drape, index, node.position)
    if (text.current) {
      const sample = sampleTrack(track, index)
      text.current.textContent =
        sample.time !== null
          ? formatClock(sample.time)
          : joinParts(distanceParts(sample.distance))
    }
  })

  if (!drape || !fit) return null
  return (
    <group ref={group} visible={false}>
      <Glyphs name='playhead' positions={ORIGIN} />
      <Label
        position={[0, 0, fit.tileSize * 0.03]}
        visible={() => group.current?.visible ?? false}
      >
        <span className='tag tag-invert'>
          <span className='tag-key'>▶</span>
          <span ref={text} className='tabular-nums' />
        </span>
      </Label>
    </group>
  )
}

// ------------------------------------------------------------ terrain cursor

export function TerrainCursor() {
  const group = useRef<Group>(null)
  useFrame(() => {
    const node = group.current
    if (!node) return
    node.visible = sceneRefs.pointer !== null && hoverStore.state.index === null
    if (sceneRefs.pointer) node.position.copy(sceneRefs.pointer)
  })
  return (
    <group ref={group} visible={false}>
      <Glyphs name='cursor' positions={ORIGIN} />
    </group>
  )
}

// ------------------------------------------------------------ pointer

/** Relative change of the camera's matrix that counts as a move. */
const MOVED = 1e-7

const sameLocation = (a: GeoLocation | null, b: GeoLocation | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.lat === b.lat &&
    a.lon === b.lon &&
    a.alt === b.alt)

/** Pointer distance (CSS px) within which the route counts as hovered. */
const HOVER_RADIUS = 16
/** Larger tracks are searched coarsely first. */
const MAX_PROJECTED = 20_000

/**
 * Hover and click on the scene: the terrain under the pointer (`pick`),
 * and the track point nearest to the pointer on screen.
 */
export function PointerProbe() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const camera = useThree((s) => s.camera)
  const pointer = useRef({
    x: 0,
    y: 0,
    inside: false,
    dirty: false,
    owner: false
  })
  const down = useRef<{ x: number; y: number } | null>(null)
  const raycaster = useMemo(() => new Raycaster(), [])
  const ndc = useMemo(() => new Vector2(), [])
  const lastCamera = useRef<number[]>([])

  useEffect(() => {
    const element = gl.domElement
    const state = pointer.current
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      state.x = event.clientX - rect.left
      state.y = event.clientY - rect.top
      state.inside = true
      state.dirty = true
      // the cursor follows the pointer on the terrain: a frame for it
      invalidate()
    }
    const leave = () => {
      state.inside = false
      state.dirty = true
      invalidate()
    }
    const press = (event: PointerEvent) => {
      down.current = { x: event.clientX, y: event.clientY }
      element.focus({ preventScroll: true })
    }
    const release = (event: PointerEvent) => {
      const start = down.current
      down.current = null
      if (
        !start ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
      )
        return
      // a click (not a drag) on the route moves the playhead there
      const index = hoverStore.state.index
      const track = viewerStore.state.track
      if (index !== null && track) seek(progressAtIndex(track, index))
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerenter', move)
    element.addEventListener('pointerleave', leave)
    element.addEventListener('pointerdown', press)
    element.addEventListener('pointerup', release)
    return () => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerenter', move)
      element.removeEventListener('pointerleave', leave)
      element.removeEventListener('pointerdown', press)
      element.removeEventListener('pointerup', release)
    }
  }, [gl, invalidate])

  useFrame((state) => {
    const p = pointer.current
    // a still pointer hovers something else when the camera moves — by
    // more than the rounding of the controls, which recompute it every frame
    const matrix = camera.matrixWorld.elements
    const cameraMoved = matrix.some(
      (v, i) =>
        !(Math.abs(v - lastCamera.current[i]) <= MOVED * (1 + Math.abs(v)))
    )
    if (cameraMoved) lastCamera.current = Array.from(matrix)
    if (!p.dirty && !(cameraMoved && p.inside)) return
    p.dirty = false

    if (!p.inside) {
      sceneRefs.pointer = null
      if (p.owner) {
        p.owner = false
        setHoverIndex(null)
        hoverStore.setState((s) => ({ ...s, cursor: null }))
      }
      return
    }
    p.owner = true

    const { width, height } = state.size
    ndc.set((p.x / width) * 2 - 1, -(p.y / height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)

    const { surface, ready, drape } = terrainStore.state
    const world = sceneRefs.world
    const hit = surface && ready ? surface.pick(raycaster) : undefined
    sceneRefs.pointer =
      hit && world ? world.worldToLocal(hit.point.clone()) : null
    const cursor = hit ? { lat: hit.lat, lon: hit.lon, alt: hit.alt } : null
    // the same place: no change, so no frame asked for
    hoverStore.setState((s) =>
      sameLocation(s.cursor, cursor) ? s : { ...s, cursor }
    )

    const index =
      drape && world
        ? nearestOnScreen(drape.points, world, camera, p, width, height)
        : null
    setHoverIndex(index)
    gl.domElement.style.cursor = index !== null ? 'pointer' : ''
  })

  return null
}

const projected = new Vector3()

function nearestOnScreen(
  points: Float32Array,
  world: Group,
  camera: Camera,
  pointer: { x: number; y: number },
  width: number,
  height: number
): number | null {
  const count = points.length / 3
  const distance = (i: number) => {
    projected.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2])
    projected.applyMatrix4(world.matrixWorld).project(camera)
    if (projected.z > 1) return Infinity
    const x = ((projected.x + 1) / 2) * width
    const y = ((1 - projected.y) / 2) * height
    return Math.hypot(x - pointer.x, y - pointer.y)
  }
  const stride = Math.max(1, Math.ceil(count / MAX_PROJECTED))
  let best = -1
  let bestDistance = Infinity
  for (let i = 0; i < count; i += stride) {
    const d = distance(i)
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  if (stride > 1 && best >= 0) {
    for (
      let i = Math.max(0, best - stride);
      i < Math.min(count, best + stride);
      i++
    ) {
      const d = distance(i)
      if (d < bestDistance) {
        bestDistance = d
        best = i
      }
    }
  }
  return bestDistance <= HOVER_RADIUS ? best : null
}
