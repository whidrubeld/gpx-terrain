import { createStore } from '@tanstack/react-store'
import type { GeoLocation, Map } from 'three-map-terrain'

import { GpxError, type GpxErrorCode, parseGpx } from '../gpx/parse'
import { PRESETS, type PresetId, presetUrl } from '../gpx/presets'
import { buildTrack, type Track } from '../gpx/track'
import type { TerrainFit } from '../lib/fit'

// ------------------------------------------------------------ track

export type TrackSource =
  | { kind: 'preset'; id: PresetId }
  | { kind: 'file'; name: string; size: number }

/** Translated by the UI, so it follows a change of language. */
export type LoadError =
  | { code: GpxErrorCode | 'network' }
  | { code: 'loadFailed'; detail: string | null }

export interface ViewerState {
  source: TrackSource | null
  track: Track | null
  /** the track being read right now */
  loading: TrackSource | null
  error: LoadError | null
}

export const viewerStore = createStore<ViewerState>({
  source: null,
  track: null,
  loading: null,
  error: null
})

const MAX_FILE_SIZE = 64 * 1024 ** 2
let request = 0

function show(
  text: string,
  source: TrackSource,
  fallbackName: string,
  id: number
) {
  if (id !== request) return
  try {
    const track = buildTrack(parseGpx(text), fallbackName)
    viewerStore.setState(() => ({
      source,
      track,
      loading: null,
      error: null
    }))
    hoverStore.setState(() => ({ index: null, waypoint: null, cursor: null }))
    playbackStore.setState((s) => ({ ...s, playing: false, progress: 1 }))
    closeChooser()
  } catch (error) {
    fail(error, id)
  }
}

function fail(error: unknown, id: number) {
  if (id !== request) return
  // fetch() rejects with a TypeError worded by each browser ("Failed to
  // fetch", "Load failed"…): say it in the app's language instead
  const reason: LoadError =
    error instanceof GpxError
      ? { code: error.code }
      : error instanceof TypeError
        ? { code: 'network' }
        : {
            code: 'loadFailed',
            detail: error instanceof Error ? error.message : null
          }
  viewerStore.setState((s) => ({ ...s, loading: null, error: reason }))
}

export async function loadPreset(id: PresetId) {
  const current = ++request
  const source: TrackSource = { kind: 'preset', id }
  viewerStore.setState((s) => ({ ...s, loading: source, error: null }))
  try {
    const response = await fetch(presetUrl(id))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const preset = PRESETS.find((p) => p.id === id)
    show(await response.text(), source, preset?.name ?? id, current)
  } catch (error) {
    fail(error, current)
  }
}

export async function loadFile(file: File) {
  const current = ++request
  if (file.size > MAX_FILE_SIZE) {
    fail(new GpxError('tooLarge'), current)
    return
  }
  const source: TrackSource = { kind: 'file', name: file.name, size: file.size }
  viewerStore.setState((s) => ({ ...s, loading: source, error: null }))
  try {
    const name = file.name.replace(/\.gpx$/i, '')
    show(await file.text(), source, name, current)
  } catch (error) {
    fail(error, current)
  }
}

export function dismissError() {
  viewerStore.setState((s) => ({ ...s, error: null }))
}

// ------------------------------------------------------------ terrain

export interface Drape {
  /** terrain-space position (x, y, z) of every track point, on the surface */
  points: Float32Array
  /** the rendered polyline: track points densified to the mesh resolution */
  line: Float32Array
  /** fractional track point index of every polyline vertex (non-decreasing) */
  lineIndex: Float32Array
}

/**
 * The terrain as it is drawn, for what lies on it and for picking: a `Map`,
 * or the levels of detail of two (scene/lod.ts).
 */
export type Surface = Pick<
  Map,
  'getTerrainPositionSync' | 'getPosition' | 'getLocation' | 'pick'
>

export interface TerrainState {
  /** the map of the whole grid (with levels of detail: the coarse one) */
  map: Map | null
  surface: Surface | null
  fit: TerrainFit | null
  /** the grid has loaded, or enough of it after a timeout (see `Terrain`) */
  ready: boolean
  /** `performance.now()` when the grid became ready: t = 0 of the intro */
  readyAt: number | null
  /** bumped whenever more terrain became ready: derived geometry is rebuilt */
  revision: number
  /** tiles with elevation / with their texture / in the grid */
  loaded: number
  textured: number
  total: number
  /** tiles drawn in detail; `null` without levels of detail */
  detailed: number | null
  /** lowest and highest vertex, scene units (before exaggeration) */
  heights: { min: number; max: number } | null
  drape: Drape | null
}

export const terrainStore = createStore<TerrainState>({
  map: null,
  surface: null,
  fit: null,
  ready: false,
  readyAt: null,
  revision: 0,
  loaded: 0,
  textured: 0,
  total: 0,
  detailed: null,
  heights: null,
  drape: null
})

// ------------------------------------------------------------ hover

export interface HoverState {
  /** fractional track point index under the pointer (scene or profile) */
  index: number | null
  /** waypoint under the pointer or keyboard focus */
  waypoint: number | null
  /** terrain under the pointer */
  cursor: GeoLocation | null
}

export const hoverStore = createStore<HoverState>({
  index: null,
  waypoint: null,
  cursor: null
})

export const setHoverIndex = (index: number | null) =>
  hoverStore.setState((s) => (s.index === index ? s : { ...s, index }))

export const setHoverWaypoint = (waypoint: number | null) =>
  hoverStore.setState((s) => (s.waypoint === waypoint ? s : { ...s, waypoint }))

// ------------------------------------------------------------ playback

/** Seconds to play the whole track at ×1. */
export const PLAYBACK_SECONDS = 40
export const SPEED_OPTIONS = [0.5, 1, 2, 4] as const

export interface PlaybackState {
  playing: boolean
  /** 0…1 of the track duration (of the distance without timestamps) */
  progress: number
  speed: number
}

export const playbackStore = createStore<PlaybackState>({
  playing: false,
  progress: 1,
  speed: 1
})

export function togglePlayback() {
  playbackStore.setState((s) =>
    s.playing
      ? { ...s, playing: false }
      : { ...s, playing: true, progress: s.progress >= 1 ? 0 : s.progress }
  )
}

export function restartPlayback() {
  playbackStore.setState((s) => ({ ...s, progress: 0, playing: true }))
}

export function seek(progress: number) {
  playbackStore.setState((s) => ({
    ...s,
    progress: Math.min(1, Math.max(0, progress))
  }))
}

export function setSpeed(speed: number) {
  playbackStore.setState((s) => ({ ...s, speed }))
}

// ------------------------------------------------------------ ui

export interface UiState {
  /** the track chooser is open over a loaded track (without one it always shows) */
  chooser: boolean
  help: boolean
  /** first-visit hint with the basic controls */
  hint: boolean
  dragging: boolean
  /** resolved theme */
  theme: 'dark' | 'light'
  /** how far the panels cover the canvas from each side, CSS px */
  insets: Insets
  /** `compact`: phones and short screens, panels open one at a time as a sheet */
  layout: 'regular' | 'compact'
  sheet: SheetId | null
}

export type SheetId = 'track' | 'view' | 'legend' | 'perf'

/** Phones and short landscape screens get the compact layout. */
export const COMPACT_QUERY = '(max-width: 899px), (max-height: 559px)'

export function toggleSheet(sheet: SheetId) {
  uiStore.setState((s) => ({ ...s, sheet: s.sheet === sheet ? null : sheet }))
}

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

const HINT_KEY = 'gpx-terrain/hint-seen'

function hintSeen() {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

export const uiStore = createStore<UiState>({
  chooser: false,
  help: false,
  hint: !hintSeen(),
  dragging: false,
  theme: 'dark',
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  layout:
    typeof matchMedia === 'function' && matchMedia(COMPACT_QUERY).matches
      ? 'compact'
      : 'regular',
  sheet: null
})

export const openChooser = () =>
  uiStore.setState((s) =>
    s.chooser ? s : { ...s, chooser: true, sheet: null }
  )

export const closeChooser = () =>
  uiStore.setState((s) => (s.chooser ? { ...s, chooser: false } : s))

export function setHelp(help: boolean) {
  uiStore.setState((s) => ({ ...s, help }))
  if (help) dismissHint()
}

export function dismissHint() {
  uiStore.setState((s) => (s.hint ? { ...s, hint: false } : s))
  try {
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    // not remembered
  }
}

// ------------------------------------------------------------ commands

/** One-off requests from the UI to the scene (camera moves) and the file dialog. */
export const commands = new EventTarget()

export type FocusTarget = { lat: number; lon: number } | null

export const resetView = () => commands.dispatchEvent(new Event('reset-view'))
export const requestFile = () => commands.dispatchEvent(new Event('open-file'))
export const focusOn = (target: FocusTarget) =>
  commands.dispatchEvent(
    new CustomEvent<FocusTarget>('focus', { detail: target })
  )
