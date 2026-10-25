import { createStore } from '@tanstack/react-store'

import { type LanguageSetting, LOCALES } from '../i18n/locales'

export type ThemeSetting = 'system' | 'dark' | 'light'
export type PanelId = 'track' | 'view' | 'legend' | 'perf' | 'profile'

/**
 * How the terrain and its features are drawn — each look complete on its
 * own, anywhere (see scene/look.ts): the photo, the photo in gray, a
 * colored model without the photo, lines.
 */
export const LOOKS = ['photo', 'mono', 'model', 'wireframe'] as const
export type Look = (typeof LOOKS)[number]
export type SolidLook = Exclude<Look, 'wireframe'>

/** Map features drawn on the terrain from OpenStreetMap (see scene/layers.ts). */
export const FEATURES = ['buildings', 'roads', 'water', 'vegetation'] as const
export type Feature = (typeof FEATURES)[number]
export type FeatureSet = Record<Feature, boolean>

/**
 * The features each look shows until they are changed: on the photo only
 * what it lacks — the height of buildings; roads too on the gray one;
 * everything on the model and in lines.
 */
export const LOOK_FEATURES: Readonly<Record<Look, Readonly<FeatureSet>>> = {
  photo: { buildings: true, roads: false, water: false, vegetation: false },
  mono: { buildings: true, roads: true, water: false, vegetation: false },
  model: { buildings: true, roads: true, water: true, vegetation: true },
  wireframe: { buildings: true, roads: true, water: true, vegetation: true }
}

export interface Settings {
  theme: ThemeSetting
  language: LanguageSetting
  look: Look
  /** the look W goes back to from wireframe */
  solidLook: SolidLook
  /** map features on the terrain at all (C) */
  features: boolean
  /** which features each look shows */
  lookFeatures: Record<Look, FeatureSet>
  animations: boolean
  autoRotate: boolean
  fog: boolean
  graticule: boolean
  distanceMarks: boolean
  waypoints: boolean
  base: boolean
  follow: boolean
  /** single-key shortcuts (⌘/Ctrl combinations always work) */
  shortcuts: boolean
  /** the advanced view settings are open */
  advanced: boolean
  /** vertical exaggeration, applied as `scale.z` (free, no reload) */
  exaggeration: number
  /** `MapOptions.tileSegments` (rebuilds the map) */
  segments: number
  /** `MapOptions.nTiles` (rebuilds the map) */
  tiles: number
  /**
   * levels of detail: `segments` only where the camera is near, half of
   * them farther away (rebuilds the map; see scene/lod.ts)
   */
  lod: boolean
  /** CSS pixels per rendered pixel: > 1 renders a chunky, pixelated scene */
  pixelSize: number
  panels: Record<PanelId, boolean>
}

export const SEGMENT_OPTIONS = [64, 128, 192] as const
export const TILE_OPTIONS = [3, 5] as const
export const PIXEL_OPTIONS = [1, 2, 3, 4] as const
export const EXAGGERATION = { min: 1, max: 3, step: 0.25 } as const
export const THEMES: readonly ThemeSetting[] = ['system', 'dark', 'light']
const LANGUAGES: readonly LanguageSetting[] = ['auto', ...LOCALES]

/** Read by the inline script in index.html as well. */
export const STORAGE_KEY = 'gpx-terrain/settings@1'
/** Where the viewer kept them while it was the three-map-terrain demo. */
const LEGACY_KEY = 'three-map-terrain/gpx-viewer/settings@1'

const media = (query: string) =>
  typeof matchMedia === 'function' && matchMedia(query).matches

function defaults(): Settings {
  const compact = media('(max-width: 767px)')
  return {
    theme: 'system',
    language: 'auto',
    look: 'wireframe',
    solidLook: 'photo',
    features: true,
    lookFeatures: {
      photo: { ...LOOK_FEATURES.photo },
      mono: { ...LOOK_FEATURES.mono },
      model: { ...LOOK_FEATURES.model },
      wireframe: { ...LOOK_FEATURES.wireframe }
    },
    animations: !media('(prefers-reduced-motion: reduce)'),
    autoRotate: false,
    fog: true,
    graticule: true,
    distanceMarks: true,
    waypoints: true,
    base: true,
    follow: false,
    shortcuts: true,
    advanced: false,
    exaggeration: 1.25,
    segments: 128,
    tiles: 3,
    lod: true,
    pixelSize: 1,
    panels: {
      track: !compact,
      view: !compact,
      legend: !compact,
      perf: !compact,
      profile: true
    }
  }
}

const isLook = (value: unknown): value is Look =>
  (LOOKS as readonly unknown[]).includes(value)

/** The look of the settings before looks: imagery and wireframe apart. */
function legacyLook({ imagery, wireframe }: Record<string, unknown>) {
  if (wireframe === true) return 'wireframe'
  return imagery === 'mono' ? 'mono' : imagery === 'relief' ? 'model' : 'photo'
}

/** Features of every look stored before vegetation, when it was trees. */
function legacyFeatures(stored: unknown) {
  if (typeof stored !== 'object' || stored === null) return stored
  return Object.fromEntries(
    Object.entries(stored).map(([look, set]: [string, unknown]) => [
      look,
      typeof set === 'object' &&
      set !== null &&
      'trees' in set &&
      !('vegetation' in set)
        ? { ...set, vegetation: set.trees }
        : set
    ])
  )
}

/** Booleans of `stored` where `base` has them; nested objects key by key. */
function mergeBooleans<T extends Record<string, unknown>>(
  base: T,
  stored: unknown
): T {
  const source = (stored ?? {}) as Record<string, unknown>
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(base)) {
    if (typeof value === 'object' && value !== null)
      merged[key] = mergeBooleans(value as Record<string, unknown>, source[key])
    else if (typeof value === 'boolean' && typeof source[key] === 'boolean')
      merged[key] = source[key]
  }
  return merged as T
}

/** Stored values of the right type override the defaults; anything else is ignored. */
function load(): Settings {
  const base = defaults()
  try {
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ??
        localStorage.getItem(LEGACY_KEY) ??
        '{}'
    ) as Record<string, unknown>
    const merged: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(base)) {
      if (key === 'panels' || key === 'lookFeatures') continue
      if (typeof stored[key] === typeof value) merged[key] = stored[key]
    }
    merged.panels = mergeBooleans(base.panels, stored.panels)
    merged.lookFeatures = mergeBooleans(
      base.lookFeatures,
      legacyFeatures(stored.lookFeatures)
    )
    const settings = merged as unknown as Settings
    // settings of before looks: their imagery and wireframe
    const legacy = 'imagery' in stored || 'wireframe' in stored
    if (!isLook(stored.look))
      settings.look = legacy ? legacyLook(stored) : base.look
    const solid = stored.solidLook
    settings.solidLook =
      isLook(solid) && solid !== 'wireframe'
        ? solid
        : settings.look === 'wireframe'
          ? 'photo'
          : settings.look
    if (!(SEGMENT_OPTIONS as readonly number[]).includes(settings.segments))
      settings.segments = base.segments
    if (!(TILE_OPTIONS as readonly number[]).includes(settings.tiles))
      settings.tiles = base.tiles
    if (!(PIXEL_OPTIONS as readonly number[]).includes(settings.pixelSize))
      settings.pixelSize = 1
    if (!THEMES.includes(settings.theme)) settings.theme = base.theme
    if (!LANGUAGES.includes(settings.language))
      settings.language = base.language
    settings.exaggeration = Math.min(
      EXAGGERATION.max,
      Math.max(EXAGGERATION.min, settings.exaggeration)
    )
    return settings
  } catch {
    return base
  }
}

export const settingsStore = createStore<Settings>(load())

settingsStore.subscribe((settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // private mode or storage disabled: settings just are not remembered
  }
})

type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never
}[keyof Settings]

export function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K]
) {
  settingsStore.setState((s) => (s[key] === value ? s : { ...s, [key]: value }))
}

export function toggleSetting(key: BooleanKey) {
  settingsStore.setState((s) => ({ ...s, [key]: !s[key] }))
}

export function togglePanel(id: PanelId, open?: boolean) {
  settingsStore.setState((s) => ({
    ...s,
    panels: { ...s.panels, [id]: open ?? !s.panels[id] }
  }))
}

export function setLook(look: Look) {
  settingsStore.setState((s) =>
    s.look === look
      ? s
      : { ...s, look, solidLook: look === 'wireframe' ? s.solidLook : look }
  )
}

/** The next look, wrapping around. */
export const cycleLook = () =>
  setLook(LOOKS[(LOOKS.indexOf(settingsStore.state.look) + 1) % LOOKS.length])

/** Into lines, and back to the look before. */
export const toggleWireframe = () =>
  setLook(
    settingsStore.state.look === 'wireframe'
      ? settingsStore.state.solidLook
      : 'wireframe'
  )

/** Shows or hides a feature in the current look. */
export function setLookFeature(feature: Feature, shown: boolean) {
  settingsStore.setState((s) => ({
    ...s,
    lookFeatures: {
      ...s.lookFeatures,
      [s.look]: { ...s.lookFeatures[s.look], [feature]: shown }
    }
  }))
}

/** The features drawn now: the look's, unless features are off. */
export const shownFeatures = (settings: Settings): FeatureSet =>
  settings.features
    ? settings.lookFeatures[settings.look]
    : { buildings: false, roads: false, water: false, vegetation: false }

/** Steps through a list of options, wrapping around. */
export function cycleSetting<K extends 'pixelSize' | 'theme'>(
  key: K,
  options: readonly Settings[K][]
) {
  settingsStore.setState((s) => {
    const index = options.indexOf(s[key])
    return { ...s, [key]: options[(index + 1) % options.length] }
  })
}

export function nudgeExaggeration(direction: 1 | -1) {
  settingsStore.setState((s) => ({
    ...s,
    exaggeration: Math.min(
      EXAGGERATION.max,
      Math.max(EXAGGERATION.min, s.exaggeration + direction * EXAGGERATION.step)
    )
  }))
}
