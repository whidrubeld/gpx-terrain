import { useSelector } from '@tanstack/react-store'
import { useCallback } from 'react'

import { settingsStore } from '../state/settings'
import en from './locales/en.json'
import ru from './locales/ru.json'
import { type Locale, resolveLocale } from './locales'

export * from './locales'

/** `en.json` defines the keys; every other locale must have all of them. */
export type Messages = typeof en

const MESSAGES: Record<Locale, Messages> = { en, ru }

/** A leaf that depends on a count: `Intl.PluralRules` categories. */
interface PluralForms {
  one: string
  other: string
}

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | PluralForms
    ? `${Prefix}${K}`
    : Paths<T[K], `${Prefix}${K}.`>
}[keyof T & string]

/** Dotted path to a message, e.g. `track.distance`. */
export type MessageKey = Paths<Messages>

export type Params = Record<string, string | number>

const pluralRules = new Map<Locale, Intl.PluralRules>()

function lookup(messages: Messages, key: string): unknown {
  let node: unknown = messages
  for (const part of key.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part]
  }
  return node
}

/**
 * The message for `key` with `{name}` placeholders filled from `params`.
 * Plural messages pick their form by `params.count`. Placeholders without a
 * param stay, for `Rich` to fill with elements.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Params
): string {
  let message = lookup(MESSAGES[locale], key) ?? lookup(MESSAGES.en, key)
  if (message !== null && typeof message === 'object') {
    let rules = pluralRules.get(locale)
    if (!rules) {
      rules = new Intl.PluralRules(locale)
      pluralRules.set(locale, rules)
    }
    const forms = message as Record<string, string | undefined>
    message = forms[rules.select(Number(params?.count ?? 0))] ?? forms.other
  }
  if (typeof message !== 'string') return key
  if (!params) return message
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}

export const currentLocale = () => resolveLocale(settingsStore.state.language)

/** Outside React: translates into the current language. */
export const t = (key: MessageKey, params?: Params) =>
  translate(currentLocale(), key, params)

export type Translate = typeof t

/** The current language; re-renders the component when it changes. */
export const useLocale = () =>
  useSelector(settingsStore, (s) => resolveLocale(s.language))

export function useT(): Translate {
  const locale = useLocale()
  return useCallback(
    (key: MessageKey, params?: Params) => translate(locale, key, params),
    [locale]
  )
}

const ACTIVITIES: Partial<Record<string, keyof Messages['activity']>> = {
  hiking: 'hiking',
  hike: 'hiking',
  walking: 'walking',
  walk: 'walking',
  running: 'running',
  run: 'running',
  trail_running: 'trailRunning',
  cycling: 'cycling',
  biking: 'cycling',
  ride: 'cycling',
  road_biking: 'cycling',
  road_cycling: 'cycling',
  mountain_biking: 'mountainBiking',
  skiing: 'skiing',
  driving: 'driving',
  // Strava's numeric activity types
  '1': 'cycling',
  '4': 'hiking',
  '9': 'running',
  '10': 'walking'
}

/** A GPX `<type>` in words: known activities translated, others as written. */
export function activityLabel(translate: Translate, type: string) {
  const key =
    ACTIVITIES[
      type
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_')
    ]
  return key ? translate(`activity.${key}`) : type
}
