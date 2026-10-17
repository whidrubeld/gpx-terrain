import { useSelector } from '@tanstack/react-store'
import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore
} from 'react'

import { type Hotkey, keysOf } from '../hotkeys'
import { useT } from '../i18n'
import type { Parts } from '../lib/format'
import { type PanelId, settingsStore, togglePanel } from '../state/settings'
import { Icon, type IconName } from './Icon'

export const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(' ')

/**
 * For a horizontally scrolling strip: keeps the `aria-current` item in view
 * whenever `key` changes (without scrolling the page).
 */
export function useCurrentInView<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const strip = ref.current
    const current = strip?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!strip || !current) return
    const left = current.offsetLeft - strip.offsetLeft
    const right = left + current.offsetWidth
    if (left < strip.scrollLeft)
      strip.scrollTo({ left: left - 8, behavior: 'smooth' })
    else if (right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({
        left: right - strip.clientWidth + 8,
        behavior: 'smooth'
      })
    }
  }, [key])
  return ref
}

/** Whether a media query matches, kept up to date. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const media = matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => matchMedia(query).matches
  )
}

/** `navigator.onLine`, kept up to date. */
export function useOnline() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('online', onChange)
      window.addEventListener('offline', onChange)
      return () => {
        window.removeEventListener('online', onChange)
        window.removeEventListener('offline', onChange)
      }
    },
    () => navigator.onLine
  )
}

/**
 * A key hint. Single keys hide while single-key shortcuts are off (and on
 * touch screens); `always`: keys that work regardless (⌘/Ctrl combinations, Esc).
 */
export function Kbd({
  children,
  always = false
}: {
  children: ReactNode
  always?: boolean
}) {
  return <kbd className={cx('kbd', always && 'kbd-always')}>{children}</kbd>
}

/** All keys of a hotkey, e.g. `⌘` `O`. */
export function Keys({ hotkey }: { hotkey: Hotkey }) {
  const always = hotkey.mod ?? hotkey.codes.length === 0
  return (
    <span className='flex gap-1'>
      {keysOf(hotkey).map((key) => (
        <Kbd key={key} always={always}>
          {key}
        </Kbd>
      ))}
    </span>
  )
}

/**
 * A modal `<dialog>` while `open`: Esc and the backdrop call `onClose`. The
 * element marked `data-autofocus` gets the focus. It scrolls inside, so that
 * the corner ticks on its border stay visible.
 */
export function Modal({
  open,
  onClose,
  label,
  labelledBy,
  className,
  children
}: {
  open: boolean
  onClose: () => void
  label?: string
  labelledBy?: string
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      element.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && element.open) element.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-label={label}
      aria-labelledby={labelledBy}
      className={cx(
        'panel ticks m-auto max-h-none overflow-visible border-line bg-panel-solid p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-sm',
        className
      )}
      // Esc: the state closes the dialog (in the effect above), not the
      // browser, so the element never disagrees with what React rendered
      // (Esc and then O in quick succession would leave it shut)
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // when the browser closes it anyway (cancel is not always cancelable);
      // `close` arrives a task later: by then it may have been opened again
      onClose={() => {
        if (!ref.current?.open) onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      {open && (
        <div className='max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain'>
          {children}
        </div>
      )}
    </dialog>
  )
}

/**
 * Text that takes the width of its longest option, so that a button does
 * not change size while cycling through them (in any language).
 */
export function StableLabel({
  value,
  options
}: {
  value: string
  options: readonly string[]
}) {
  return (
    <span className='inline-grid text-left'>
      {options.map((option) => (
        <span
          key={option}
          className={cx(
            'col-start-1 row-start-1',
            option !== value && 'invisible'
          )}
          aria-hidden={option !== value}
        >
          {option}
        </span>
      ))}
    </span>
  )
}

export function Panel({
  id,
  index,
  title,
  icon,
  actions,
  className,
  children
}: {
  id: PanelId
  index: string
  title: string
  icon: IconName
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  const t = useT()
  const open = useSelector(settingsStore, (s) => s.panels[id])
  const body = useId()
  return (
    <section
      className={cx(
        'panel ticks pointer-events-auto flex min-h-0 flex-col',
        className
      )}
      aria-label={title}
    >
      <header className='flex h-8 flex-none items-center gap-2 pl-2.5 pr-1'>
        <Icon name={icon} cell={1} className='text-muted' />
        <h2 className='hud-label text-fg!'>{title}</h2>
        <span className='hud-label'>{index}</span>
        <span className='rule' />
        {actions}
        <button
          type='button'
          className='btn btn-icon h-6! w-6! border-transparent'
          aria-expanded={open}
          aria-controls={body}
          aria-label={t(open ? 'panels.collapse' : 'panels.expand', {
            title
          })}
          onClick={() => togglePanel(id)}
        >
          <Icon name={open ? 'minus' : 'plus'} cell={1} />
        </button>
      </header>
      {open && (
        <div
          id={body}
          className='appear min-h-0 overflow-y-auto border-t border-line px-2.5 pb-2.5 pt-2'
        >
          {children}
        </div>
      )}
    </section>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  hotkey
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hotkey?: string
}) {
  return (
    <label className='flex h-6 cursor-pointer select-none items-center gap-2'>
      <span className='flex-1 truncate text-2xs font-semibold uppercase tracking-[0.12em]'>
        {label}
      </span>
      {hotkey && <Kbd>{hotkey}</Kbd>}
      <input
        type='checkbox'
        role='switch'
        className='sr-only'
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className='switch' aria-hidden />
    </label>
  )
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  format = String,
  hotkey
}: {
  label: string
  value: T
  options: readonly T[]
  onChange: (value: T) => void
  format?: (value: T) => string
  hotkey?: string
}) {
  const name = useId()
  return (
    <fieldset className='grid gap-1'>
      <legend className='mb-1 flex w-full items-center justify-between'>
        <span className='hud-label'>{label}</span>
        {hotkey && <Kbd>{hotkey}</Kbd>}
      </legend>
      <div className='segmented'>
        {options.map((option) => (
          <label key={option}>
            <input
              type='radio'
              className='sr-only'
              name={name}
              checked={option === value}
              onChange={() => onChange(option)}
            />
            <span>{format(option)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  hotkey
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  hotkey?: string
}) {
  return (
    <label className='grid gap-1'>
      <span className='flex items-center gap-2'>
        <span className='hud-label flex-1'>{label}</span>
        {hotkey && <Kbd>{hotkey}</Kbd>}
        <span className='w-10 text-right text-2xs font-semibold tabular-nums'>
          {display}
        </span>
      </span>
      <input
        type='range'
        className='range'
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

/** A value in the dot-matrix face with its unit in mono. */
export function Value({
  parts,
  size = 'md'
}: {
  parts: Parts
  size?: 'sm' | 'md' | 'lg'
}) {
  const [value, unit] = parts
  return (
    <span className='inline-flex items-baseline gap-1 whitespace-nowrap'>
      <span
        className={cx(
          'dot',
          size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-xl' : 'text-base'
        )}
      >
        {value}
      </span>
      {unit && (
        <span className='text-2xs font-semibold text-muted'>{unit}</span>
      )}
    </span>
  )
}

export function Stat({
  label,
  parts,
  size
}: {
  label: string
  parts: Parts
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <div className='grid min-w-0 gap-1'>
      <dt className='hud-label truncate'>{label}</dt>
      <dd>
        <Value parts={parts} size={size} />
      </dd>
    </div>
  )
}
