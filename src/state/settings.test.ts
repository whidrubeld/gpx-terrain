// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

/** A fresh settings module, as loaded on startup with this storage. */
async function load(storage: Record<string, string>) {
  localStorage.clear()
  for (const [key, value] of Object.entries(storage))
    localStorage.setItem(key, value)
  vi.resetModules()
  const { settingsStore } = await import('./settings')
  return settingsStore.state
}

describe('settings', () => {
  afterEach(() => localStorage.clear())

  it('start with the browser language and theme', async () => {
    const settings = await load({})
    expect(settings.language).toBe('auto')
    expect(settings.theme).toBe('system')
    expect(settings.shortcuts).toBe(true)
  })

  it('start with the photo, showing on it only what it lacks', async () => {
    const settings = await load({})
    expect(settings.look).toBe('photo')
    expect(settings.features).toBe(true)
    expect(settings.lookFeatures.photo).toEqual({
      buildings: true,
      roads: false,
      water: false,
      trees: false
    })
    expect(Object.values(settings.lookFeatures.model)).not.toContain(false)
  })

  it('keep the features of every look, and drop what is not a choice', async () => {
    const settings = await load({
      'gpx-terrain/settings@1': JSON.stringify({
        look: 'model',
        lookFeatures: { model: { trees: false, water: 'no' }, photo: 1 }
      })
    })
    expect(settings.look).toBe('model')
    expect(settings.lookFeatures.model).toMatchObject({
      trees: false,
      water: true
    })
    expect(settings.lookFeatures.photo.buildings).toBe(true)
  })

  it('turn imagery and wireframe of before into a look', async () => {
    const look = async (stored: object) =>
      (await load({ 'gpx-terrain/settings@1': JSON.stringify(stored) })).look
    expect(await look({ imagery: 'relief' })).toBe('model')
    expect(await look({ imagery: 'mono', wireframe: true })).toBe('wireframe')
    expect(await look({ look: 'sepia', imagery: 'color' })).toBe('photo')
    const settings = await load({
      'gpx-terrain/settings@1': '{"imagery":"mono","wireframe":true}'
    })
    // W goes back to a look that is not lines
    expect(settings.solidLook).toBe('photo')
  })

  it('keep a chosen language and drop unknown values', async () => {
    expect(
      (await load({ 'gpx-terrain/settings@1': '{"language":"ru"}' })).language
    ).toBe('ru')
    const settings = await load({
      'gpx-terrain/settings@1': '{"language":"de","theme":"sepia","tiles":4}'
    })
    expect(settings.language).toBe('auto')
    expect(settings.theme).toBe('system')
    expect(settings.tiles).toBe(3)
  })

  it('take over the settings of the three-map-terrain demo', async () => {
    const settings = await load({
      'three-map-terrain/gpx-viewer/settings@1':
        '{"theme":"light","imagery":"mono"}'
    })
    expect(settings.theme).toBe('light')
    expect(settings.look).toBe('mono')
  })

  it('are stored under the new key', async () => {
    await load({})
    const { setSetting } = await import('./settings')
    setSetting('language', 'en')
    expect(
      JSON.parse(localStorage.getItem('gpx-terrain/settings@1') ?? '{}')
    ).toMatchObject({ language: 'en' })
  })
})
