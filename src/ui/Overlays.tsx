import { useSelector } from '@tanstack/react-store'
import { shallow } from '@tanstack/react-store'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { type Translate, useT } from '../i18n'
import { applyUpdate, dismissUpdate, pwaStore } from '../pwa'
import {
  dismissError,
  dismissHint,
  loadFile,
  type LoadError,
  setHelp,
  terrainStore,
  uiStore,
  viewerStore
} from '../state/viewer'
import { cx, Kbd, useTouch } from './controls'
import { Icon } from './Icon'

/** Tile-by-tile progress while the grid loads: outline → dotted (DEM) → solid (imagery). */
export function LoadingHud() {
  const t = useT()
  const loading = useSelector(viewerStore, (s) => s.loading !== null)
  const terrain = useSelector(
    terrainStore,
    (s) => ({
      fit: s.fit,
      ready: s.ready,
      loaded: s.loaded,
      textured: s.textured,
      total: s.total
    }),
    { compare: shallow }
  )
  const done = terrain.total > 0 && terrain.textured >= terrain.total
  // imagery may never finish (a tile server failing): give up showing it 8 s after the relief
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    setExpired(false)
    if (!terrain.ready) return
    const timer = setTimeout(() => setExpired(true), 8000)
    return () => clearTimeout(timer)
  }, [terrain.ready, terrain.fit])
  const busy =
    loading || (terrain.fit !== null && (!terrain.ready || (!done && !expired)))
  // stay a moment after the last tile, then step out; idle from the start
  // when nothing loads (no "Terrain ready" for a terrain that was ready)
  const [linger, setLinger] = useState(busy)
  useEffect(() => {
    if (busy) {
      setLinger(true)
      return
    }
    const timer = setTimeout(() => setLinger(false), 800)
    return () => clearTimeout(timer)
  }, [busy])

  if (!busy && !linger) return null
  const n = terrain.fit?.nTiles ?? 3
  const label = t(
    loading
      ? 'loading.reading'
      : !terrain.ready
        ? 'loading.building'
        : done
          ? 'loading.ready'
          : 'loading.streaming'
  )

  const cells = (size: string) => (
    <div
      className='grid gap-1'
      style={{ gridTemplateColumns: `repeat(${n}, ${size})` }}
      aria-hidden
    >
      {Array.from({ length: n * n }, (_, i) => (
        <span
          key={i}
          className={cx(
            'aspect-square border',
            i < terrain.textured
              ? 'border-fg bg-fg'
              : i < terrain.loaded
                ? 'border-fg bg-[radial-gradient(var(--fg)_1px,transparent_1.2px)] bg-[length:3px_3px]'
                : 'border-line-strong'
          )}
        />
      ))}
    </div>
  )
  const counts = `Dem ${terrain.loaded}/${terrain.total} · Img ${terrain.textured}/${terrain.total}${terrain.fit ? ` · Z${terrain.fit.zoom}` : ''}`

  // once the relief is up, step aside: a compact strip under the top bar
  if (terrain.ready) {
    return (
      <div
        className='pointer-events-none fixed left-1/2 top-[4.25rem] z-20 -translate-x-1/2'
        role='status'
      >
        <div className='panel ticks flex items-center gap-3 px-3 py-2'>
          {cells('6px')}
          <span className={cx('hud-label text-fg!', !done && 'caret')}>
            {label}
          </span>
          <span className='hud-label tabular-nums'>{counts}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className='pointer-events-none fixed left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2'
      role='status'
    >
      <div className='panel ticks grid justify-items-center gap-3 px-6 py-5'>
        {cells('14px')}
        <div className={cx('hud-label text-fg!', !done && 'caret')}>
          {label}
        </div>
        <div className='hud-label tabular-nums'>{counts}</div>
      </div>
    </div>
  )
}

/** A .gpx dropped anywhere on the page opens; `uiStore.dragging` while one is over it. */
export function useFileDrop() {
  useEffect(() => {
    let depth = 0
    const hasFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes('Files') ?? false
    const set = (value: boolean) =>
      uiStore.setState((s) =>
        s.dragging === value ? s : { ...s, dragging: value }
      )
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth++
      set(true)
    }
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (!depth) set(false)
    }
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth = 0
      set(false)
      const file = event.dataTransfer?.files[0]
      if (file) void loadFile(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])
}

/** Over the track view while a file is dragged (the chooser has its own drop area). */
export function DropOverlay() {
  const t = useT()
  const dragging = useSelector(uiStore, (s) => s.dragging)
  if (!dragging) return null
  return (
    <div className='pointer-events-none fixed inset-3 z-40 grid place-items-center border border-dashed border-fg bg-panel backdrop-blur-sm'>
      <div className='appear grid justify-items-center gap-3 text-center'>
        <Icon name='upload' cell={4} />
        <span className='dot text-3xl'>{t('drop.title')}</span>
        <span className='hud-label'>{t('drop.note')}</span>
      </div>
    </div>
  )
}

/**
 * A toast in the top layer (a manual popover), so that it shows above modal
 * dialogs too. Browsers without popovers show it as a fixed element.
 */
function Toast({
  open,
  role,
  children
}: {
  open: boolean
  role: 'alert' | 'status'
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof element.showPopover !== 'function') return
    if (element.matches(':popover-open')) element.hidePopover()
    // shown again on every change: on top of whatever opened in between
    if (open) element.showPopover()
  })
  if (!open) return null
  return (
    <div
      ref={ref}
      popover='manual'
      role={role}
      className='fixed inset-auto left-1/2 top-20 z-30 m-0 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 overflow-visible border-0 bg-transparent p-0 text-fg'
    >
      {children}
    </div>
  )
}

export function errorMessage(t: Translate, error: LoadError) {
  if (error.code !== 'loadFailed') return t(`error.${error.code}`)
  return error.detail
    ? t('error.loadFailed', { detail: error.detail })
    : t('error.loadFailedPlain')
}

export function ErrorToast() {
  const t = useT()
  const error = useSelector(viewerStore, (s) => s.error)
  return (
    <Toast open={error !== null} role='alert'>
      {error && (
        <div className='panel ticks flex items-center gap-3 bg-panel-solid p-3'>
          {/* the tag and the first line of the message share a baseline */}
          <p className='flex flex-1 items-baseline gap-3 text-2xs uppercase leading-4 tracking-[0.08em]'>
            <span className='tag tag-strong flex-none'>{t('error.title')}</span>
            <span>{errorMessage(t, error)}</span>
          </p>
          <button
            type='button'
            className='btn btn-icon h-6! w-6!'
            onClick={dismissError}
            aria-label={t('error.dismiss')}
          >
            <Icon name='close' cell={1} />
          </button>
        </div>
      )}
    </Toast>
  )
}

/** A new version of the app is installed and waits for a reload. */
export function UpdateToast() {
  const t = useT()
  const needRefresh = useSelector(pwaStore, (s) => s.needRefresh)
  return (
    <Toast open={needRefresh} role='status'>
      <div className='panel ticks flex items-center gap-3 bg-panel-solid p-3'>
        <Icon name='download' cell={1} className='flex-none' />
        <p className='flex-1 text-2xs font-semibold uppercase leading-4 tracking-[0.08em]'>
          {t('update.available')}
        </p>
        <button type='button' className='btn h-6' onClick={dismissUpdate}>
          {t('update.later')}
        </button>
        <button
          type='button'
          className='btn btn-primary h-6'
          onClick={applyUpdate}
        >
          {t('update.reload')}
        </button>
      </div>
    </Toast>
  )
}

/** First visit: how to move the camera. */
export function Hint() {
  const t = useT()
  const hint = useSelector(uiStore, (s) => s.hint)
  const touch = useTouch()
  if (!hint) return null
  const items: [string, string][] = touch
    ? [
        [t('hint.oneFinger'), t('hint.pan')],
        [t('hint.twoFingers'), t('hint.zoomRotate')],
        [t('hint.tapRoute'), t('hint.inspectSeek')]
      ]
    : [
        [t('hint.drag'), t('hint.pan')],
        [t('hint.rightDrag'), t('hint.rotate')],
        [t('hint.scroll'), t('hint.zoom')],
        [t('hint.hover'), t('hint.inspect')],
        [t('hint.click'), t('hint.seek')]
      ]
  return (
    <div className='pointer-events-auto panel ticks flex flex-wrap items-center gap-x-4 gap-y-1 bg-panel-solid px-3 py-2'>
      {items.map(([key, action]) => (
        <span
          key={key}
          className='flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.1em]'
        >
          <span className='tag'>{key}</span>
          <span className='text-muted'>{action}</span>
        </span>
      ))}
      <button type='button' className='btn h-6' onClick={() => setHelp(true)}>
        {t('hint.all')} <Kbd>?</Kbd>
      </button>
      <button
        type='button'
        className='btn btn-icon h-6! w-6!'
        onClick={dismissHint}
        aria-label={t('error.dismiss')}
      >
        <Icon name='close' cell={1} />
      </button>
    </div>
  )
}
