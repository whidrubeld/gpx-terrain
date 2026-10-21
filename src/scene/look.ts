import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three'
import {
  CROWN_COLOR,
  type ImageryProcessor,
  WATER_COLOR
} from 'three-map-terrain'

import { type Look, settingsStore } from '../state/settings'
import { terrainStore } from '../state/viewer'

/** Scene colors per theme; the 2D tokens live in index.css. */
export const PALETTE = {
  dark: {
    bg: '#0a0a0a',
    fg: '#f4f4f4',
    halo: '#000000',
    relief: '#5a5a5a',
    edge: '#8c8c8c'
  },
  light: {
    bg: '#f2f2f2',
    fg: '#0a0a0a',
    halo: '#ffffff',
    relief: '#e4e4e4',
    edge: '#6e6e6e'
  }
} as const

export type Theme = keyof typeof PALETTE
export type Palette = (typeof PALETTE)[Theme]

/** How a look draws the terrain and the map features, in one theme. */
export interface LookStyle {
  /** the photo, the photo in gray, or none */
  imagery: 'color' | 'mono' | null
  wireframe: boolean
  /** the terrain without imagery — and while its imagery loads */
  terrain: string
  /** the sides of the terrain base, or its outline */
  base: string
  buildings: string
  roads: string
  water: string
  trees: string
}

/**
 * The looks. On the photo, features keep the colors of the library (white
 * buildings, blue water, green trees); on the gray photo they are gray; the
 * model is a colored map in relief; in lines, the terrain is a quiet grid
 * and every feature has a color of its own, so that none merges into it.
 */
export const LOOK_STYLES: Readonly<
  Record<Look, Readonly<Record<Theme, LookStyle>>>
> = {
  photo: {
    dark: {
      imagery: 'color',
      wireframe: false,
      terrain: PALETTE.dark.relief,
      base: '#262626',
      buildings: '#ffffff',
      roads: '#d6d6d6',
      water: WATER_COLOR,
      trees: CROWN_COLOR
    },
    light: {
      imagery: 'color',
      wireframe: false,
      terrain: PALETTE.light.relief,
      base: '#d4d4d4',
      buildings: '#ffffff',
      roads: '#d6d6d6',
      water: WATER_COLOR,
      trees: CROWN_COLOR
    }
  },
  mono: {
    dark: {
      imagery: 'mono',
      wireframe: false,
      terrain: PALETTE.dark.relief,
      base: '#262626',
      buildings: '#ffffff',
      roads: '#d6d6d6',
      water: '#404040',
      trees: '#303030'
    },
    light: {
      imagery: 'mono',
      wireframe: false,
      terrain: PALETTE.light.relief,
      base: '#d4d4d4',
      buildings: '#ffffff',
      roads: '#d6d6d6',
      water: '#a8a8a8',
      trees: '#8c8c8c'
    }
  },
  model: {
    dark: {
      imagery: null,
      wireframe: false,
      terrain: '#57544e',
      base: '#2b2a28',
      buildings: '#dcdcdc',
      roads: '#a39e95',
      water: '#3d6b92',
      trees: '#4d7540'
    },
    light: {
      imagery: null,
      wireframe: false,
      terrain: '#e6e0d4',
      base: '#b9b2a4',
      buildings: '#ffffff',
      roads: '#faf8f3',
      water: '#8fb8d9',
      trees: '#7fa463'
    }
  },
  wireframe: {
    dark: {
      imagery: null,
      wireframe: true,
      terrain: '#3d3d3d',
      base: '#6a6a6a',
      buildings: '#b4b4b4',
      roads: '#e0a24a',
      water: '#2f6496',
      trees: '#5fae52'
    },
    light: {
      imagery: null,
      wireframe: true,
      terrain: '#c4c4c4',
      base: '#9a9a9a',
      buildings: '#6e6e6e',
      roads: '#c7801f',
      water: '#86b6e0',
      trees: '#4a9a42'
    }
  }
}

/** Whether a look shows the photo: then it is credited. */
export const showsImagery = (look: Look) =>
  LOOK_STYLES[look].dark.imagery !== null

/** The `mono` imagery: luminance, with a little extra contrast. */
export const monochrome: ImageryProcessor = (context, { width, height }) => {
  const pixels = context.getImageData(0, 0, width, height)
  const { data } = pixels
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    data[i] = data[i + 1] = data[i + 2] = (luma - 118) * 1.25 + 128
  }
  context.putImageData(pixels, 0, 0)
}

// ------------------------------------------------------------ intro timeline

/** `[start, duration]` in seconds after the terrain grid is ready. */
export const INTRO = {
  rise: [0, 1.6],
  camera: [0, 2.6],
  route: [0.9, 2.4]
} as const satisfies Record<string, readonly [number, number]>

/** 0…1 progress of an intro step; always 1 with animations off. */
export function introPhase([start, duration]: readonly [
  number,
  number
]): number {
  const { readyAt } = terrainStore.state
  if (readyAt === null) return 0
  if (!settingsStore.state.animations) return 1
  const t = ((performance.now() - readyAt) / 1000 - start) / duration
  return Math.min(1, Math.max(0, t))
}

/**
 * Seconds one frame may advance continuous motion (auto-rotate, playback).
 * A hidden tab or a suspended app stops the frame loop, and the first frame
 * back reports the whole absence: the camera would spin through every turn
 * it missed.
 */
export const frameStep = (delta: number) => Math.min(delta, 0.1)

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2

// ------------------------------------------------------------ pixel sprites

/**
 * Marker glyphs drawn on a pixel grid (`#` = ink). Every glyph gets a
 * one-pixel halo in the opposite color so it reads on any imagery.
 */
export const GLYPHS = {
  start: [
    '#######',
    '#.....#',
    '#.###.#',
    '#.###.#',
    '#.###.#',
    '#.....#',
    '#######'
  ],
  finish: [
    '#.#.#.#',
    '.#.#.#.',
    '#.#.#.#',
    '.#.#.#.',
    '#.#.#.#',
    '.#.#.#.',
    '#.#.#.#'
  ],
  waypoint: [
    '...#...',
    '..###..',
    '.#####.',
    '#######',
    '.#####.',
    '..###..',
    '...#...'
  ],
  mark: ['###', '###', '###'],
  playhead: [
    '..###..',
    '.#...#.',
    '#..#..#',
    '#.###.#',
    '#..#..#',
    '.#...#.',
    '..###..'
  ],
  hover: [
    '##.....##',
    '#.......#',
    '.........',
    '....#....',
    '...###...',
    '....#....',
    '.........',
    '#.......#',
    '##.....##'
  ],
  cursor: ['..#..', '..#..', '#####', '..#..', '..#..']
} as const

export type GlyphName = keyof typeof GLYPHS

/** Width of a glyph in grid cells, halo included. */
export const glyphCells = (name: GlyphName) => GLYPHS[name][0].length + 2

export function glyphTexture(
  name: GlyphName,
  ink: string,
  halo: string
): CanvasTexture {
  const rows = GLYPHS[name]
  const size = rows[0].length + 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context is not available')

  const inked = (x: number, y: number) => rows[y - 1]?.[x - 1] === '#'
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inked(x, y)) context.fillStyle = ink
      else if (
        [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => inked(x + dx, y + dy)))
      )
        context.fillStyle = halo
      else continue
      context.fillRect(x, y, 1, 1)
    }
  }

  const texture = new CanvasTexture(canvas)
  texture.magFilter = texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = SRGBColorSpace
  return texture
}

/**
 * `PointsMaterial.size` (CSS px: three multiplies it by the pixel ratio)
 * that draws one glyph cell as a whole number of buffer pixels — 2 CSS px
 * per cell, never less than one buffer pixel in pixel mode.
 */
export const glyphSize = (name: GlyphName, dpr: number) =>
  (glyphCells(name) * Math.max(1, Math.round(2 * dpr))) / dpr
