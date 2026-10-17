// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseGpx } from './gpx/parse'
import { buildTrack } from './gpx/track'
import { handleHotkey, HOTKEYS, IS_APPLE, keysOf } from './hotkeys'
import { setSetting, settingsStore } from './state/settings'
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
    const wireframe = settingsStore.state.wireframe
    setSetting('shortcuts', false)
    expect(press('KeyW').handled).toBe(false)
    expect(settingsStore.state.wireframe).toBe(wireframe)
    expect(press('KeyO', { ctrlKey: true }).handled).toBe(true)
    setSetting('shortcuts', true)
    expect(press('KeyW').handled).toBe(true)
    expect(settingsStore.state.wireframe).toBe(!wireframe)
    press('KeyW')
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
