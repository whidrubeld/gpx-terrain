// Keyboard shortcuts: one table for the key handler and the help dialog.
//
// Viewer controls are single keys, like in other map and 3D viewers: browser
// and OS shortcuts all carry a modifier, so these never collide with them.
// They can be switched off (`settings.shortcuts`, WCAG 2.1.4). Keys are
// matched by `KeyboardEvent.code`, the physical key, so they work with any
// keyboard layout (R is R on a Russian layout too).
//
// Document commands use the platform's modifier (⌘ on Apple devices, Ctrl
// elsewhere) where the convention exists and browsers let pages have it:
// only ⌘O / Ctrl+O. Most other ⌘/Ctrl letters belong to the browser (some,
// like ⌘W or Ctrl+T, cannot be taken at all); Alt opens browser menus on
// Windows and Linux and types special characters on macOS.

import { PRESETS } from './gpx/presets'
import type { MessageKey } from './i18n'
import {
  cycleLook,
  cycleSetting,
  nudgeExaggeration,
  PIXEL_OPTIONS,
  settingsStore,
  THEMES,
  toggleSetting,
  togglePanel,
  toggleWireframe
} from './state/settings'
import {
  loadPreset,
  openChooser,
  playbackStore,
  requestFile,
  resetView,
  restartPlayback,
  seek,
  setHelp,
  type SheetId,
  togglePlayback,
  toggleSheet,
  uiStore,
  viewerStore
} from './state/viewer'

export type HotkeyGroup = 'playback' | 'view' | 'layers' | 'panels' | 'app'

export interface Hotkey {
  /** `KeyboardEvent.code`s: physical keys, so any keyboard layout works */
  codes: readonly string[]
  /** shown in the help dialog */
  keys: readonly string[]
  /** with ⌘ (Apple) or Ctrl (others) */
  mod?: boolean
  label: MessageKey
  group: HotkeyGroup
  run: () => void
}

export const HOTKEY_GROUPS: readonly HotkeyGroup[] = [
  'playback',
  'view',
  'layers',
  'panels',
  'app'
]

/** Apple keyboards have ⌘ where others have Ctrl. */
export const IS_APPLE =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform
  )

export const MOD_KEY = IS_APPLE ? '⌘' : 'Ctrl'

/** The keys as shown: `['⌘', 'O']` on a Mac, `['Ctrl', 'O']` elsewhere. */
export const keysOf = (hotkey: Hotkey) =>
  hotkey.mod ? [MOD_KEY, ...hotkey.keys] : hotkey.keys

/** Without a track the chooser is the whole app. */
export const chooserVisible = () =>
  viewerStore.state.track === null || uiStore.state.chooser

/** Track-only keys do nothing while the chooser is up. */
const withTrack = (run: () => void) => () => {
  if (!chooserVisible()) run()
}

/** Side panels on large screens, the bottom sheet on compact ones. */
const panel = (id: SheetId) =>
  withTrack(() => {
    if (uiStore.state.layout === 'compact') toggleSheet(id)
    else togglePanel(id)
  })

const step = (direction: 1 | -1) =>
  withTrack(() => {
    playbackStore.setState((s) => ({ ...s, playing: false }))
    seek(playbackStore.state.progress + direction * 0.01)
  })

export const HOTKEYS: readonly Hotkey[] = [
  {
    codes: ['Space'],
    keys: ['Space'],
    label: 'help.keys.playPause',
    group: 'playback',
    run: withTrack(togglePlayback)
  },
  {
    codes: ['Home'],
    keys: ['Home'],
    label: 'help.keys.restart',
    group: 'playback',
    run: withTrack(restartPlayback)
  },
  {
    codes: ['Comma'],
    keys: [','],
    label: 'help.keys.stepBack',
    group: 'playback',
    run: step(-1)
  },
  {
    codes: ['Period'],
    keys: ['.'],
    label: 'help.keys.stepForward',
    group: 'playback',
    run: step(1)
  },
  {
    codes: ['KeyF'],
    keys: ['F'],
    label: 'help.keys.follow',
    group: 'playback',
    run: () => toggleSetting('follow')
  },

  {
    codes: ['KeyR'],
    keys: ['R'],
    label: 'help.keys.frame',
    group: 'view',
    run: withTrack(resetView)
  },
  {
    codes: ['KeyS'],
    keys: ['S'],
    label: 'help.keys.autoRotate',
    group: 'view',
    run: () => toggleSetting('autoRotate')
  },
  {
    codes: ['BracketLeft'],
    keys: ['['],
    label: 'help.keys.lessExaggeration',
    group: 'view',
    run: () => nudgeExaggeration(-1)
  },
  {
    codes: ['BracketRight'],
    keys: [']'],
    label: 'help.keys.moreExaggeration',
    group: 'view',
    run: () => nudgeExaggeration(1)
  },
  {
    codes: ['KeyX'],
    keys: ['X'],
    label: 'help.keys.pixelSize',
    group: 'view',
    run: () => cycleSetting('pixelSize', PIXEL_OPTIONS)
  },
  {
    codes: ['KeyA'],
    keys: ['A'],
    label: 'help.keys.animations',
    group: 'view',
    run: () => toggleSetting('animations')
  },
  {
    codes: ['KeyT'],
    keys: ['T'],
    label: 'help.keys.theme',
    group: 'view',
    run: () => cycleSetting('theme', THEMES)
  },

  {
    codes: ['KeyI'],
    keys: ['I'],
    label: 'help.keys.look',
    group: 'layers',
    run: cycleLook
  },
  {
    codes: ['KeyW'],
    keys: ['W'],
    label: 'help.keys.wireframe',
    group: 'layers',
    run: toggleWireframe
  },
  {
    codes: ['KeyC'],
    keys: ['C'],
    label: 'help.keys.features',
    group: 'layers',
    run: () => toggleSetting('features')
  },
  {
    codes: ['KeyG'],
    keys: ['G'],
    label: 'help.keys.graticule',
    group: 'layers',
    run: () => toggleSetting('graticule')
  },
  {
    codes: ['KeyK'],
    keys: ['K'],
    label: 'help.keys.distanceMarks',
    group: 'layers',
    run: () => toggleSetting('distanceMarks')
  },
  {
    codes: ['KeyM'],
    keys: ['M'],
    label: 'help.keys.waypoints',
    group: 'layers',
    run: () => toggleSetting('waypoints')
  },
  {
    codes: ['KeyB'],
    keys: ['B'],
    label: 'help.keys.base',
    group: 'layers',
    run: () => toggleSetting('base')
  },

  {
    codes: ['KeyD'],
    keys: ['D'],
    label: 'help.keys.track',
    group: 'panels',
    run: panel('track')
  },
  {
    codes: ['KeyV'],
    keys: ['V'],
    label: 'help.keys.view',
    group: 'panels',
    run: panel('view')
  },
  {
    codes: ['KeyL'],
    keys: ['L'],
    label: 'help.keys.legend',
    group: 'panels',
    run: panel('legend')
  },
  {
    codes: ['KeyP'],
    keys: ['P'],
    label: 'help.keys.perf',
    group: 'panels',
    run: panel('perf')
  },

  {
    codes: ['KeyO'],
    keys: ['O'],
    mod: true,
    label: 'help.keys.openFile',
    group: 'app',
    run: requestFile
  },
  {
    codes: ['KeyO'],
    keys: ['O'],
    label: 'help.keys.change',
    group: 'app',
    // the chooser first; in it, the file dialog
    run: () => {
      if (chooserVisible()) requestFile()
      else openChooser()
    }
  },
  {
    codes: PRESETS.map((_, i) => `Digit${i + 1}`),
    keys: PRESETS.map((_, i) => String(i + 1)),
    label: 'help.keys.examples',
    group: 'app',
    run: () => undefined
  },
  {
    codes: ['Slash', 'KeyH'],
    keys: ['?', 'H'],
    label: 'help.keys.help',
    group: 'app',
    run: () => setHelp(!uiStore.state.help)
  },
  {
    // handled by the dialogs themselves; listed for the help dialog
    codes: [],
    keys: ['Esc'],
    label: 'help.keys.close',
    group: 'app',
    run: () => undefined
  }
]

const TEXT_INPUT =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable="true"]'
const ACTIVATES = 'button, a[href], input, label, summary'

/** Runs the hotkey of a key press; returns whether one ran. */
export function handleHotkey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.altKey) return false
  const mod = IS_APPLE ? event.metaKey : event.ctrlKey
  const foreign = IS_APPLE ? event.ctrlKey : event.metaKey
  if (foreign) return false

  if (mod) {
    if (event.shiftKey) return false
    const hotkey = HOTKEYS.find((h) => h.mod && h.codes.includes(event.code))
    if (!hotkey) return false
    hotkey.run()
    event.preventDefault()
    return true
  }

  if (!settingsStore.state.shortcuts) return false
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest(TEXT_INPUT)) return false
  // Space and Enter keep activating the focused control
  if (
    (event.code === 'Space' || event.code === 'Enter') &&
    target?.closest(ACTIVATES)
  )
    return false

  const digit = /^Digit([1-9])$/.exec(event.code)
  if (digit) {
    const preset = PRESETS.at(Number(digit[1]) - 1)
    if (!preset) return false
    void loadPreset(preset.id)
    event.preventDefault()
    return true
  }

  const hotkey = HOTKEYS.find((h) => !h.mod && h.codes.includes(event.code))
  if (!hotkey) return false
  hotkey.run()
  event.preventDefault()
  return true
}
