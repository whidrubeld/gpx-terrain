// The example tracks in public/presets/ (made by `yarn presets`). Their stats
// are shown before the file is loaded; gpx.test.ts checks them against the
// files, so regenerate both together.

export const PRESETS = [
  {
    id: 'eiger-trail',
    name: 'Eiger Trail',
    activity: 'hiking',
    /** m */
    distance: 5841,
    ascent: 58,
    descent: 749,
    /** ms */
    duration: 6_720_000
  },
  {
    id: 'stelvio',
    name: 'Passo dello Stelvio',
    activity: 'cycling',
    distance: 23_866,
    ascent: 1818,
    descent: 7,
    duration: 7_710_000
  },
  {
    id: 'bright-angel',
    name: 'Bright Angel Trail',
    activity: 'hiking',
    distance: 12_398,
    ascent: 3,
    descent: 1311,
    duration: 12_696_000
  }
] as const

export type Preset = (typeof PRESETS)[number]
export type PresetId = Preset['id']

export const presetUrl = (id: PresetId) =>
  `${import.meta.env.BASE_URL}presets/${id}.gpx`
