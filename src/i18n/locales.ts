// No imports here: the settings store and the inline script in index.html
// depend on this list, the translations depend on the settings store.

export const LOCALES = ['en', 'ru'] as const
export type Locale = (typeof LOCALES)[number]

/** `auto` follows the browser until the user picks a language. */
export type LanguageSetting = 'auto' | Locale

const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value)

/** The first supported language in the browser's preference list, else English. */
export function detectLocale(
  languages: readonly string[] = typeof navigator === 'undefined'
    ? []
    : navigator.languages
): Locale {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split(/[-_]/)[0]
    if (isLocale(primary)) return primary
  }
  return 'en'
}

let detected: Locale | undefined

export const resolveLocale = (setting: LanguageSetting): Locale =>
  setting === 'auto' ? (detected ??= detectLocale()) : setting
