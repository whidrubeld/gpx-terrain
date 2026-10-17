import { useSelector } from '@tanstack/react-store'
import { useId, useLayoutEffect, useRef } from 'react'

import { PRESETS } from '../gpx/presets'
import { activityLabel, useT } from '../i18n'
import {
  distanceParts,
  elevationParts,
  formatDuration,
  joinParts
} from '../lib/format'
import {
  closeChooser,
  commands,
  loadFile,
  loadPreset,
  requestFile,
  uiStore,
  viewerStore
} from '../state/viewer'
import { cx, Kbd, Modal, useMedia } from './controls'
import { Icon } from './Icon'
import { LIBRARY, REPOSITORY, Toolbar } from './Toolbar'

/**
 * The hidden file input behind "Choose file", O and ⌘O / Ctrl+O. Exactly one
 * is mounted: in the chooser while it shows (a modal dialog makes everything
 * outside it inert), else in the app.
 */
export function FileInput() {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  // before the first paint: a key pressed right after a track appears finds it
  useLayoutEffect(() => {
    const open = () => input.current?.click()
    commands.addEventListener('open-file', open)
    return () => commands.removeEventListener('open-file', open)
  }, [])
  return (
    <input
      ref={input}
      type='file'
      accept='.gpx,application/gpx+xml,application/xml,text/xml'
      className='hidden'
      tabIndex={-1}
      aria-label={t('chooser.choose')}
      onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) void loadFile(file)
        event.target.value = ''
      }}
    />
  )
}

/** Drop a file on it (or anywhere on the page), or click it. */
function DropArea() {
  const t = useT()
  const dragging = useSelector(uiStore, (s) => s.dragging)
  const reading = useSelector(viewerStore, (s) => s.loading?.kind === 'file')
  // phones and tablets cannot drag files in: just the button
  const touch = useMedia('(hover: none) and (pointer: coarse)')
  return (
    <div
      className='drop-area grid cursor-pointer justify-items-center gap-3 px-4 py-7 text-center'
      data-active={dragging}
      onClick={requestFile}
    >
      <Icon name='upload' cell={3} />
      {!touch && (
        <p className='text-sm font-bold uppercase tracking-[0.1em]'>
          {t(dragging ? 'chooser.dropActive' : 'chooser.drop')}
        </p>
      )}
      <div className='flex items-center gap-3'>
        {!touch && <span className='hud-label'>{t('chooser.or')}</span>}
        <button
          type='button'
          className='btn btn-primary h-9 px-4'
          // the dialog focuses it when it opens: Enter picks a file
          data-autofocus
          onClick={(event) => {
            event.stopPropagation()
            requestFile()
          }}
        >
          {t('chooser.choose')}
          <Kbd>O</Kbd>
        </button>
      </div>
      <p
        className={cx(
          'max-w-[34rem] text-3xs uppercase leading-3 tracking-[0.1em]',
          reading ? 'caret text-fg' : 'text-muted'
        )}
        role='status'
      >
        {t(reading ? 'chooser.reading' : 'chooser.note')}
      </p>
    </div>
  )
}

function Examples() {
  const t = useT()
  const heading = useId()
  const source = useSelector(viewerStore, (s) => s.source)
  const loading = useSelector(viewerStore, (s) => s.loading)
  return (
    <section className='grid gap-2' aria-labelledby={heading}>
      <div className='flex items-center gap-2'>
        <h2 id={heading} className='hud-label'>
          {t('chooser.examples')}
        </h2>
        <span className='rule' />
      </div>
      <ul className='grid gap-2 sm:grid-cols-3'>
        {PRESETS.map((preset, i) => {
          const current = source?.kind === 'preset' && source.id === preset.id
          const busy = loading?.kind === 'preset' && loading.id === preset.id
          return (
            <li key={preset.id} className='grid'>
              <button
                type='button'
                className='choice'
                aria-current={current}
                aria-busy={busy}
                onClick={() => void loadPreset(preset.id)}
              >
                <span className='flex items-center justify-between gap-2'>
                  <span className='hud-label'>
                    {String(i + 1).padStart(2, '0')} ·{' '}
                    {activityLabel(t, preset.activity)}
                  </span>
                  <Kbd>{i + 1}</Kbd>
                </span>
                <span
                  className={cx(
                    'text-sm font-bold uppercase leading-tight tracking-[0.06em]',
                    busy && 'caret'
                  )}
                >
                  {preset.name}
                </span>
                <span className='text-2xs uppercase leading-4 tracking-[0.08em] text-muted'>
                  {t(`presets.${preset.id}`)}
                </span>
                {/* the same 2×2 grid in every card and language */}
                <span className='mt-auto grid grid-cols-2 gap-x-3 gap-y-0.5 pt-2 text-2xs font-semibold uppercase tabular-nums tracking-[0.06em]'>
                  <span>{joinParts(distanceParts(preset.distance))}</span>
                  <span>{formatDuration(preset.duration)}</span>
                  <span>↑ {joinParts(elevationParts(preset.ascent))}</span>
                  <span>↓ {joinParts(elevationParts(preset.descent))}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** A file or an example: the start screen, and the "Change track" dialog. */
export function ChooserPanel({ onClose }: { onClose?: () => void }) {
  const t = useT()
  return (
    <div className='appear grid gap-5'>
      <FileInput />
      {/* the logo is centered on the title; the lead runs under the title */}
      <header className='grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2'>
        <Icon name='logo' cell={3} />
        <h1 className='dot text-3xl'>GPX Terrain</h1>
        {onClose && (
          <div className='flex items-center gap-2'>
            <Kbd always>Esc</Kbd>
            <button
              type='button'
              className='btn btn-icon h-7! w-7!'
              onClick={onClose}
              aria-label={t('chooser.close')}
              title={t('chooser.close')}
            >
              <Icon name='close' cell={1} />
            </button>
          </div>
        )}
        <p className='col-start-2 col-end-4 max-w-[36rem] text-2xs leading-4 text-muted'>
          {t('chooser.lead')}
        </p>
      </header>
      <DropArea />
      <Examples />
      <p className='text-3xs uppercase leading-3 tracking-[0.08em] text-muted'>
        {t('chooser.credits')}
      </p>
    </div>
  )
}

/** Without a track: the chooser is the page. */
export function Welcome({ compact }: { compact: boolean }) {
  const t = useT()
  return (
    <div className='fixed inset-0 z-10 flex flex-col gap-3 overflow-y-auto px-[max(0.75rem,env(safe-area-inset-left))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]'>
      <header className='flex justify-end'>
        <div className='panel flex h-11 items-center gap-1 px-1.5'>
          <Toolbar compact={compact} />
        </div>
      </header>
      <main className='grid flex-1 place-items-center'>
        <section
          className='panel ticks w-full max-w-[46rem] bg-panel-solid p-5 sm:p-7'
          aria-label={t('chooser.title')}
        >
          <ChooserPanel />
        </section>
      </main>
      <footer className='flex flex-wrap justify-center gap-x-5 gap-y-1 text-3xs font-semibold uppercase tracking-[0.12em] text-muted'>
        <a
          className='hover:text-fg'
          href={LIBRARY}
          target='_blank'
          rel='noreferrer'
        >
          {t('status.builtWith')}
        </a>
        <a
          className='hover:text-fg'
          href={REPOSITORY}
          target='_blank'
          rel='noreferrer'
        >
          {t('help.sourceCode')} ↗
        </a>
      </footer>
    </div>
  )
}

/** "Change track" over the open one: Esc or the backdrop keep it. */
export function ChooserDialog() {
  const t = useT()
  const open = useSelector(uiStore, (s) => s.chooser)
  return (
    <Modal
      open={open}
      onClose={closeChooser}
      label={t('chooser.title')}
      className='w-[min(46rem,calc(100vw-2rem))]'
    >
      <div className='p-5 sm:p-7'>
        <ChooserPanel onClose={closeChooser} />
      </div>
    </Modal>
  )
}
