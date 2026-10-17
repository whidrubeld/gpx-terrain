import { useSelector } from '@tanstack/react-store'

import { useT } from '../i18n'
import { formatDecimal } from '../lib/format'
import {
  EXAGGERATION,
  IMAGERY_OPTIONS,
  PIXEL_OPTIONS,
  SEGMENT_OPTIONS,
  setSetting,
  settingsStore,
  TILE_OPTIONS
} from '../state/settings'
import { Panel, Segmented, Slider, Toggle } from './controls'

const TOGGLES = [
  { key: 'wireframe', hotkey: 'W' },
  { key: 'graticule', hotkey: 'G' },
  { key: 'distanceMarks', hotkey: 'K' },
  { key: 'waypoints', hotkey: 'M' },
  { key: 'base', hotkey: 'B' },
  { key: 'fog' },
  { key: 'autoRotate', hotkey: 'S' },
  { key: 'follow', hotkey: 'F' },
  { key: 'animations', hotkey: 'A' },
  { key: 'shortcuts' }
] as const

export function ViewPanel({ className }: { className?: string }) {
  const t = useT()
  return (
    <Panel
      id='view'
      index='02'
      title={t('panels.view')}
      icon='sliders'
      className={className}
    >
      <ViewBody />
    </Panel>
  )
}

export function ViewBody() {
  const t = useT()
  const settings = useSelector(settingsStore, (s) => s)
  return (
    <div className='grid gap-3'>
      <Segmented
        label={t('view.imagery')}
        hotkey='I'
        value={settings.imagery}
        options={IMAGERY_OPTIONS}
        format={(value) => t(`view.${value}`)}
        onChange={(value) => setSetting('imagery', value)}
      />
      <Slider
        label={t('view.exaggeration')}
        hotkey='[ ]'
        value={settings.exaggeration}
        display={`×${formatDecimal(settings.exaggeration, 2)}`}
        {...EXAGGERATION}
        onChange={(value) => setSetting('exaggeration', value)}
      />
      <div className='grid'>
        {TOGGLES.map(({ key, ...rest }) => (
          <Toggle
            key={key}
            label={t(`view.${key}`)}
            hotkey={'hotkey' in rest ? rest.hotkey : undefined}
            checked={settings[key]}
            onChange={(checked) => setSetting(key, checked)}
          />
        ))}
      </div>
      <Segmented
        label={t('view.pixelSize')}
        hotkey='X'
        value={settings.pixelSize}
        options={PIXEL_OPTIONS}
        format={(value) => (value === 1 ? t('view.off') : `${value}px`)}
        onChange={(value) => setSetting('pixelSize', value)}
      />
      <div className='grid grid-cols-2 gap-2'>
        <Segmented
          label={t('view.tiles')}
          value={settings.tiles}
          options={TILE_OPTIONS}
          format={(value) => `${value}²`}
          onChange={(value) => setSetting('tiles', value)}
        />
        <Segmented
          label={t('view.mesh')}
          value={settings.segments}
          options={SEGMENT_OPTIONS}
          onChange={(value) => setSetting('segments', value)}
        />
      </div>
      <p className='text-3xs uppercase leading-3 tracking-[0.08em] text-muted'>
        {t('view.note')}
      </p>
    </div>
  )
}
