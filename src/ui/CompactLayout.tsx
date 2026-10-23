import { useSelector } from '@tanstack/react-store'
import type { ReactNode } from 'react'

import { type MessageKey, useT } from '../i18n'
import { drawsFeatures } from '../scene/layers'
import { showsImagery } from '../scene/look'
import { settingsStore, shownFeatures } from '../state/settings'
import {
  openChooser,
  type SheetId,
  terrainStore,
  toggleSheet,
  uiStore,
  viewerStore
} from '../state/viewer'
import { cx, useMedia } from './controls'
import { Icon, type IconName } from './Icon'
import { LegendBody } from './LegendPanel'
import { Hint } from './Overlays'
import { PerfBody } from './PerfPanel'
import { PlaybackControls, Profile } from './ProfilePanel'
import { Toolbar } from './Toolbar'
import { TrackTitle } from './TopBar'
import { TrackBody } from './TrackPanel'
import { ViewBody } from './ViewPanel'

const SHEETS: {
  id: SheetId
  title: MessageKey
  tab: MessageKey
  icon: IconName
  body: () => ReactNode
}[] = [
  {
    id: 'track',
    title: 'panels.track',
    tab: 'panels.track',
    icon: 'flag',
    body: () => <TrackBody />
  },
  {
    id: 'view',
    title: 'panels.view',
    tab: 'panels.view',
    icon: 'sliders',
    body: () => <ViewBody />
  },
  {
    id: 'legend',
    title: 'panels.legend',
    tab: 'panels.legend',
    icon: 'legend',
    body: () => <LegendBody />
  },
  {
    id: 'perf',
    title: 'panels.perf',
    tab: 'panels.perfShort',
    icon: 'gauge',
    body: () => <PerfBody />
  }
]

function CompactTopBar() {
  const t = useT()
  return (
    <header className='panel ticks pointer-events-auto flex h-11 items-center gap-1 px-1.5'>
      <button
        type='button'
        onClick={openChooser}
        className='btn btn-icon h-8 w-10! flex-none border-transparent'
        aria-label={t('header.home')}
        title={t('header.home')}
      >
        <Icon name='logo' cell={2} />
      </button>
      <TrackTitle compact />
      <Toolbar compact />
    </header>
  )
}

function Sheet({ id }: { id: SheetId }) {
  const t = useT()
  const sheet = SHEETS.find((s) => s.id === id)
  if (!sheet) return null
  const title = t(sheet.title)
  return (
    <section
      className='panel ticks pointer-events-auto flex max-h-[min(48dvh,26rem)] min-h-0 flex-col bg-panel-solid'
      aria-label={title}
    >
      <header className='flex h-8 flex-none items-center gap-2 pl-2.5 pr-1'>
        <Icon name={sheet.icon} cell={1} className='text-muted' />
        <h2 className='hud-label text-fg!'>{title}</h2>
        <span className='rule' />
        <button
          type='button'
          className='btn btn-icon h-6! w-6! border-transparent'
          onClick={() => toggleSheet(id)}
          aria-label={t('panels.close', { title })}
        >
          <Icon name='close' cell={1} />
        </button>
      </header>
      <div className='appear min-h-0 overflow-y-auto overscroll-contain border-t border-line px-2.5 pb-2.5 pt-2'>
        {sheet.body()}
      </div>
    </section>
  )
}

function CompactProfile({ short }: { short: boolean }) {
  const t = useT()
  const track = useSelector(viewerStore, (s) => s.track)
  const preset = useSelector(viewerStore, (s) => s.source?.kind === 'preset')
  const zoom = useSelector(terrainStore, (s) => s.fit?.zoom)
  const features = useSelector(
    settingsStore,
    (s) => zoom !== undefined && drawsFeatures(shownFeatures(s), zoom)
  )
  const imagery = useSelector(settingsStore, (s) => showsImagery(s.look))
  return (
    <section
      className='panel ticks pointer-events-auto grid min-w-0 gap-1.5 px-2 pb-1 pt-1.5'
      aria-label={t('panels.profile')}
    >
      {track && (
        <>
          <div className='flex min-w-0 items-center justify-between gap-2'>
            <span className='hud-label min-w-0 truncate text-fg!'>
              {track.name}
            </span>
            <PlaybackControls track={track} compact />
          </div>
          <Profile track={track} height={short ? 28 : 44} />
        </>
      )}
      <p className='truncate text-3xs uppercase tracking-[0.08em] text-muted'>
        {t(imagery ? 'status.attributionShort' : 'status.elevationShort')}
        {features
          ? ` · ${t('status.mapDataShort')}`
          : preset && ` · ${t('status.routesShort')}`}
      </p>
    </section>
  )
}

function TabBar({ short }: { short: boolean }) {
  const t = useT()
  const active = useSelector(uiStore, (s) => s.sheet)
  return (
    <nav
      className='panel pointer-events-auto grid grid-cols-4'
      aria-label={t('panels.label')}
    >
      {SHEETS.map(({ id, tab, icon }) => (
        <button
          key={id}
          type='button'
          className={cx(
            'btn tab border-0 text-3xs',
            short ? 'h-8 gap-2' : 'h-11 flex-col gap-1',
            active === id && 'bg-fg text-bg'
          )}
          aria-pressed={active === id}
          onClick={() => toggleSheet(id)}
        >
          <Icon name={icon} cell={1} />
          {t(tab)}
        </button>
      ))}
    </nav>
  )
}

/**
 * Phones and short screens: the scene gets the middle, the panels share one
 * sheet above the profile, opened from the tab bar.
 */
export function CompactLayout() {
  const sheet = useSelector(uiStore, (s) => s.sheet)
  // landscape phones: every pixel of height goes to the scene
  const short = useMedia('(max-height: 559px)')
  return (
    <div className='pointer-events-none fixed inset-0 z-10 flex flex-col justify-between gap-2 px-[max(0.5rem,env(safe-area-inset-left))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]'>
      <div data-inset='top'>
        <CompactTopBar />
      </div>
      <div data-inset='bottom' className='flex min-h-0 flex-col gap-2'>
        {!short && !sheet && (
          <div className='flex justify-center empty:hidden'>
            <Hint />
          </div>
        )}
        {sheet && <Sheet id={sheet} />}
        <CompactProfile short={short} />
        <TabBar short={short} />
      </div>
    </div>
  )
}
