import { useSelector } from '@tanstack/react-store'
import { useId } from 'react'

import { LOCALES, useLocale, useT } from '../i18n'
import {
  cycleSetting,
  setSetting,
  settingsStore,
  THEMES
} from '../state/settings'
import { setHelp } from '../state/viewer'
import { cx, Kbd, StableLabel } from './controls'
import { Icon } from './Icon'

export const REPOSITORY = 'https://github.com/whidrubeld/gpx-terrain'
export const LIBRARY = 'https://github.com/whidrubeld/three-map-terrain'
export const NPM = 'https://www.npmjs.com/package/three-map-terrain'

export function ThemeButton({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const theme = useSelector(settingsStore, (s) => s.theme)
  const label = t(`theme.${theme}`)
  return (
    <button
      type='button'
      className={cx('btn h-8 flex-none', compact && 'btn-icon')}
      onClick={() => cycleSetting('theme', THEMES)}
      aria-label={t('theme.label', { value: label })}
      title={compact ? t('theme.label', { value: label }) : undefined}
    >
      <Icon name='contrast' cell={1} />
      {!compact && (
        <>
          <StableLabel
            value={label}
            options={THEMES.map((option) => t(`theme.${option}`))}
          />
          <Kbd>T</Kbd>
        </>
      )}
    </button>
  )
}

/** EN | RU, next to the theme. The choice is stored; until then the browser decides. */
export function LanguageSwitch() {
  const t = useT()
  const locale = useLocale()
  const name = useId()
  return (
    <div
      className='segmented h-8 flex-none'
      role='radiogroup'
      aria-label={t('language.label')}
    >
      {LOCALES.map((code) => (
        <label
          key={code}
          className='h-full! px-2!'
          title={t(`language.${code}`)}
          lang={code}
        >
          <input
            type='radio'
            className='sr-only'
            name={name}
            checked={locale === code}
            onChange={() => setSetting('language', code)}
            aria-label={t(`language.${code}`)}
          />
          <span aria-hidden>{code}</span>
        </label>
      ))}
    </div>
  )
}

export function HelpButton({ compact = false }: { compact?: boolean }) {
  const t = useT()
  return (
    <button
      type='button'
      className={cx('btn h-8 flex-none', compact && 'btn-icon')}
      onClick={() => setHelp(true)}
      aria-label={compact ? t('header.controls') : undefined}
      title={compact ? t('header.controls') : undefined}
    >
      <Icon name={compact ? 'help' : 'keyboard'} cell={1} />
      {!compact && (
        <>
          <span className='hidden xl:inline'>{t('header.controls')}</span>
          <Kbd>?</Kbd>
        </>
      )}
    </button>
  )
}

export function SourceLink() {
  const t = useT()
  return (
    <a
      className='btn btn-icon h-8 flex-none'
      href={REPOSITORY}
      target='_blank'
      rel='noreferrer'
      aria-label={t('header.source')}
      title={t('header.source')}
    >
      <Icon name='external' cell={1} />
    </a>
  )
}

/** Theme, language, help and the source link: the right end of every top bar. */
export function Toolbar({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <ThemeButton compact={compact} />
      <LanguageSwitch />
      <HelpButton compact={compact} />
      {!compact && <SourceLink />}
    </>
  )
}
