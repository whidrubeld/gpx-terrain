import { useSelector } from '@tanstack/react-store'

import { type Translate, useT } from '../i18n'
import { formatBytes } from '../lib/format'
import { openChooser, type TrackSource, viewerStore } from '../state/viewer'
import { cx, Kbd } from './controls'
import { Icon } from './Icon'
import { Toolbar } from './Toolbar'

/** Where the track comes from: `Example · Italy · South Tyrol`, `ride.gpx · 1.2 MB · Garmin`. */
export function sourceLabel(
  t: Translate,
  source: TrackSource,
  creator: string | null
) {
  if (source.kind === 'preset')
    return `${t('header.example')} · ${t(`presets.${source.id}`)}`
  return [source.name, formatBytes(source.size), creator]
    .filter(Boolean)
    .join(' · ')
}

/** The logo: back to the track chooser, like "home". */
export function Brand() {
  const t = useT()
  return (
    <button
      type='button'
      onClick={openChooser}
      className='panel ticks pointer-events-auto flex h-11 flex-none items-center gap-3 px-3 text-left hover:bg-panel-solid'
      aria-label={t('header.home')}
      title={t('header.home')}
    >
      <Icon name='logo' cell={2} />
      <span className='dot text-lg'>GPX Terrain</span>
    </button>
  )
}

/**
 * The open track: its name and source. Clicking it (or O) opens the chooser,
 * where a file or an example replaces it.
 */
export function TrackTitle({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const track = useSelector(viewerStore, (s) => s.track)
  const source = useSelector(viewerStore, (s) => s.source)
  if (!track || !source) return null
  return (
    <button
      type='button'
      onClick={openChooser}
      className={cx(
        'group flex min-w-0 items-center text-left',
        compact
          ? 'h-8 flex-1 gap-2 px-1.5 hover:bg-line'
          : 'panel ticks pointer-events-auto h-11 max-w-[34rem] gap-4 pl-3 pr-1.5 hover:bg-panel-solid'
      )}
      aria-label={`${t('header.changeTrack')}: ${track.name}`}
      title={t('header.changeTrack')}
    >
      <span className='grid min-w-0 gap-1 leading-none'>
        <span className='truncate text-xs font-bold uppercase tracking-[0.08em]'>
          {track.name}
        </span>
        <span className='truncate text-3xs font-semibold uppercase tracking-[0.12em] text-muted'>
          {sourceLabel(t, source, track.metadata.creator)}
        </span>
      </span>
      {compact ? (
        <Icon name='swap' cell={1} className='ml-auto flex-none text-muted' />
      ) : (
        <span className='btn h-8 flex-none group-hover:border-fg group-hover:bg-fg group-hover:text-bg'>
          <Icon name='swap' cell={1} />
          {t('header.change')}
          <Kbd>O</Kbd>
        </span>
      )}
    </button>
  )
}

export function TopBar() {
  return (
    <header className='pointer-events-none flex items-start gap-3'>
      <Brand />
      <TrackTitle />
      <div className='panel pointer-events-auto ml-auto flex h-11 flex-none items-center gap-1 px-1.5'>
        <Toolbar />
      </div>
    </header>
  )
}
