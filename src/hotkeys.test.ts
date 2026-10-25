// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseGpx } from './gpx/parse'
import { buildTrack } from './gpx/track'
import { handleHotkey, HOTKEYS, IS_APPLE, keysOf } from './hotkeys'
import {
  setLook,
  setSetting,
  settingsStore,
  shownFeatures
} from './state/settings'
import { commands, uiStore, viewerStore } from './state/viewer'

const press = (
  code: string,
  init: KeyboardEventInit = {},
  target: EventTarget = document.body
) => {
  const event = new KeyboardEvent('keydown', {
    code,
    bubbles: true,
    cancelable: true,
    ...init
  })
  Object.defineProperty(event, 'target', { value: target })
  return { handled: handleHotkey(event), event }
}

const track = buildTrack(
  parseGpx(
    '<gpx><trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="1.001" lon="1"/></trkseg></trk></gpx>'
  ),
  'loop'
)

describe('handleHotkey', () => {
  const openFile = vi.fn()

  beforeEach(() => {
    commands.addEventListener('open-file', openFile)
    viewerStore.setState((s) => ({ ...s, track: null }))
    uiStore.setState((s) => ({ ...s, chooser: false }))
    setSetting('shortcuts', true)
  })

  afterEach(() => {
    commands.removeEventListener('open-file', openFile)
    openFile.mockReset()
  })

  it('opens the file dialog with the platform modifier, never with the other one', () => {
    expect(IS_APPLE).toBe(false) // jsdom: navigator.platform is ''
    expect(press('KeyO', { ctrlKey: true }).handled).toBe(true)
    expect(openFile).toHaveBeenCalledTimes(1)
    expect(press('KeyO', { metaKey: true }).handled).toBe(false)
    expect(press('KeyO', { ctrlKey: true, shiftKey: true }).handled).toBe(false)
    expect(press('KeyO', { altKey: true }).handled).toBe(false)
    expect(openFile).toHaveBeenCalledTimes(1)
  })

  it('leaves browser shortcuts alone', () => {
    for (const code of ['KeyW', 'KeyT', 'KeyR', 'KeyL', 'KeyP']) {
      const { handled, event } = press(code, { ctrlKey: true })
      expect(handled).toBe(false)
      expect(event.defaultPrevented).toBe(false)
    }
  })

  it('O opens the chooser over a track, and the file dialog in it', () => {
    viewerStore.setState((s) => ({ ...s, track }))
    press('KeyO')
    expect(uiStore.state.chooser).toBe(true)
    expect(openFile).not.toHaveBeenCalled()
    press('KeyO')
    expect(openFile).toHaveBeenCalledTimes(1)
  })

  it('O picks a file right away on the start screen', () => {
    press('KeyO')
    expect(openFile).toHaveBeenCalledTimes(1)
  })

  it('single keys can be switched off; ⌘/Ctrl combinations keep working', () => {
    setLook('photo')
    setSetting('shortcuts', false)
    expect(press('KeyW').handled).toBe(false)
    expect(settingsStore.state.look).toBe('photo')
    expect(press('KeyO', { ctrlKey: true }).handled).toBe(true)
    setSetting('shortcuts', true)
    expect(press('KeyW').handled).toBe(true)
    expect(settingsStore.state.look).toBe('wireframe')
  })

  it('W goes into lines and back to the look before, I steps through the looks', () => {
    setLook('model')
    press('KeyW')
    expect(settingsStore.state.look).toBe('wireframe')
    press('KeyW')
    expect(settingsStore.state.look).toBe('model')
    press('KeyI')
    expect(settingsStore.state.look).toBe('wireframe')
    press('KeyI')
    expect(settingsStore.state.look).toBe('photo')
  })

  it('C hides the map features and shows them again, as each look had them', () => {
    setLook('photo')
    setSetting('features', true)
    expect(shownFeatures(settingsStore.state).buildings).toBe(true)
    expect(press('KeyC').handled).toBe(true)
    expect(Object.values(shownFeatures(settingsStore.state))).toEqual([
      false,
      false,
      false,
      false
    ])
    press('KeyC')
    expect(shownFeatures(settingsStore.state)).toEqual({
      buildings: true,
      roads: false,
      water: false,
      vegetation: false
    })
  })

  it('ignores keys typed into text fields', () => {
    const input = document.createElement('input')
    expect(press('KeyW', {}, input).handled).toBe(false)
  })

  it('shows the platform modifier', () => {
    const open = HOTKEYS.find((h) => h.mod)
    expect(open && keysOf(open)).toEqual(['Ctrl', 'O'])
  })
})
