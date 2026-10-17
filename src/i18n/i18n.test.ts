import { describe, expect, it } from 'vitest'

import { activityLabel, detectLocale, LOCALES, translate } from '.'
import en from './locales/en.json'
import ru from './locales/ru.json'

interface Tree {
  [key: string]: string | Tree
}

const MESSAGES: Record<string, Tree> = { en, ru }

const isPlural = (node: Tree) => 'other' in node

/** `path → message` for every leaf (plural forms as `path#form`). */
function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const result = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') result.set(path, value)
    else if (isPlural(value)) {
      for (const [form, text] of Object.entries(value))
        result.set(`${path}#${form}`, text as string)
    } else for (const entry of leaves(value, path)) result.set(...entry)
  }
  return result
}

/** Message paths, with plural forms collapsed. */
const keys = (tree: Tree) =>
  [...leaves(tree).keys()].map((key) => key.replace(/#.*/, '')).sort()

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('translations', () => {
  it('have the same keys in every language', () => {
    const reference = [...new Set(keys(en))]
    for (const locale of LOCALES) {
      expect([...new Set(keys(MESSAGES[locale]))], locale).toEqual(reference)
    }
  })

  it('keep the placeholders of the English text', () => {
    const reference = leaves(en)
    for (const locale of LOCALES) {
      for (const [path, text] of leaves(MESSAGES[locale])) {
        const english =
          reference.get(path) ?? reference.get(path.replace(/#.*/, '#other'))
        expect(english, `${locale}: ${path}`).toBeDefined()
        expect(placeholders(text), `${locale}: ${path}`).toEqual(
          placeholders(english ?? '')
        )
      }
    }
  })

  it('have every plural form the language needs', () => {
    for (const locale of LOCALES) {
      const categories = new Intl.PluralRules(locale).resolvedOptions()
        .pluralCategories
      for (const path of leaves(MESSAGES[locale]).keys()) {
        if (!path.includes('#')) continue
        const base = path.replace(/#.*/, '')
        for (const category of categories) {
          expect(
            leaves(MESSAGES[locale]).has(`${base}#${category}`),
            `${locale}: ${base}#${category}`
          ).toBe(true)
        }
      }
    }
  })
})

describe('translate', () => {
  it('fills placeholders and leaves unknown ones for elements', () => {
    expect(translate('en', 'theme.label', { value: 'Dark' })).toBe(
      'Theme: Dark'
    )
    expect(translate('ru', 'status.routes')).toBe('Маршруты © участники {osm}')
  })

  it('picks the plural form by count', () => {
    const segments = (locale: 'en' | 'ru', count: number) =>
      translate(locale, 'track.segments', { count })
    expect(segments('en', 1)).toBe('1 segment')
    expect(segments('en', 3)).toBe('3 segments')
    expect(segments('ru', 1)).toBe('1 сегмент')
    expect(segments('ru', 3)).toBe('3 сегмента')
    expect(segments('ru', 5)).toBe('5 сегментов')
    expect(segments('ru', 21)).toBe('21 сегмент')
  })
})

describe('detectLocale', () => {
  it('takes the first supported language the browser prefers', () => {
    expect(detectLocale(['ru-RU', 'en-US'])).toBe('ru')
    expect(detectLocale(['uk-UA', 'ru', 'en'])).toBe('ru')
    expect(detectLocale(['en-GB', 'ru'])).toBe('en')
    expect(detectLocale(['de-DE', 'fr'])).toBe('en')
    expect(detectLocale([])).toBe('en')
  })
})

describe('activityLabel', () => {
  const t = (key: Parameters<typeof translate>[1]) => translate('ru', key)

  it('translates known GPX activity types, keeps others as written', () => {
    expect(activityLabel(t, 'hiking')).toBe('Пеший поход')
    expect(activityLabel(t, 'Trail-Running')).toBe('Трейлраннинг')
    expect(activityLabel(t, '1')).toBe('Велосипед')
    expect(activityLabel(t, 'Paragliding')).toBe('Paragliding')
  })
})
