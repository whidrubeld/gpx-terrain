import { useSelector } from '@tanstack/react-store'
import { type ReactNode, useId } from 'react'

import { useT } from '../i18n'
import { formatDecimal } from '../lib/format'
import { FEATURE_MIN_ZOOM } from '../scene/layers'
import {
  EXAGGERATION,
  FEATURES,
  LOOKS,
  PIXEL_OPTIONS,
  SEGMENT_OPTIONS,
  setLook,
  setLookFeature,
  setSetting,
  settingsStore,
  TILE_OPTIONS,
  toggleSetting
} from '../state/settings'
import { terrainStore } from '../state/viewer'
import { Panel, Segmented, Slider, Toggle } from './controls'
import { Icon } from './Icon'

/** What is drawn on the terrain. */
const LAYERS = [
  { key: 'base', hotkey: 'B' },
  { key: 'graticule', hotkey: 'G' },
  { key: 'waypoints', hotkey: 'M' },
  { key: 'distanceMarks', hotkey: 'K' }
] as const

/** The camera, rendering and input. */
const ADVANCED = [
  { key: 'follow', hotkey: 'F' },
  { key: 'autoRotate', hotkey: 'S' },
  { key: 'animations', hotkey: 'A' },
  { key: 'fog' },
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

/**
 * The look and what is drawn first; how it is rendered behind "Advanced",
 * closed until asked for.
 */
export function ViewBody() {
  const t = useT()
  const settings = useSelector(settingsStore, (s) => s)
  return (
    <div className='grid gap-3'>
      <div className='grid gap-1.5'>
        <Segmented
          label={t('look.label')}
          hotkey='I'
          value={settings.look}
          options={LOOKS}
          format={(value) => t(`look.${value}`)}
          onChange={setLook}
        />
        <p className='text-3xs uppercase leading-3 tracking-[0.08em] text-muted'>
          {t(`look.about.${settings.look}`)}
        </p>
      </div>
      <Slider
        label={t('view.exaggeration')}
        hotkey='[ ]'
        value={settings.exaggeration}
        display={`×${formatDecimal(settings.exaggeration, 2)}`}
        {...EXAGGERATION}
        onChange={(value) => setSetting('exaggeration', value)}
      />
      <div className='grid'>
        <Toggle
          label={t('view.features')}
          hotkey='C'
          checked={settings.features}
          onChange={(checked) => setSetting('features', checked)}
        />
        {settings.features && <Features />}
        {LAYERS.map(({ key, hotkey }) => (
          <Toggle
            key={key}
            label={t(`view.${key}`)}
            hotkey={hotkey}
            checked={settings[key]}
            onChange={(checked) => setSetting(key, checked)}
          />
        ))}
      </div>
      <Disclosure
        label={t('view.advanced')}
        open={settings.advanced}
        onToggle={() => toggleSetting('advanced')}
      >
        <div className='grid'>
          {ADVANCED.map(({ key, ...rest }) => (
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
      </Disclosure>
    </div>
  )
}

/**
 * Buildings, roads, water and trees of the current look, under its switch:
 * each look keeps its own choice. A feature the terrain's zoom cannot draw
 * says from which zoom it can.
 */
function Features() {
  const t = useT()
  const shown = useSelector(settingsStore, (s) => s.lookFeatures[s.look])
  const zoom = useSelector(terrainStore, (s) => s.fit?.zoom)
  return (
    <div className='ml-1 grid border-l border-line pl-2.5'>
      {FEATURES.map((feature) => {
        const from = FEATURE_MIN_ZOOM[feature]
        return (
          <Toggle
            key={feature}
            label={t(`view.${feature}`)}
            note={
              zoom !== undefined && zoom < from
                ? t('view.fromZoom', { zoom: from })
                : undefined
            }
            checked={shown[feature]}
            onChange={(checked) => setLookFeature(feature, checked)}
          />
        )
      })}
    </div>
  )
}

function Disclosure({
  label,
  open,
  onToggle,
  children
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const body = useId()
  return (
    <div className='grid gap-3'>
      <button
        type='button'
        className='flex h-6 w-full cursor-pointer items-center gap-2 text-muted hover:text-fg'
        aria-expanded={open}
        aria-controls={body}
        onClick={onToggle}
      >
        <span className='hud-label text-current!'>{label}</span>
        <span className='rule' />
        <Icon name={open ? 'minus' : 'plus'} cell={1} />
      </button>
      {open && (
        <div id={body} className='appear grid gap-3'>
          {children}
        </div>
      )}
    </div>
  )
}
