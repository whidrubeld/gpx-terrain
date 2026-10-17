// Display formatting in the current language. Values come back as
// [value, unit] so the UI can set the number in the dot-matrix face and the
// unit in the mono face. Components that format call `useLocale()` (or
// `useT()`) so that they re-render when the language changes.

import { currentLocale, type Locale, t } from '../i18n'

export type Parts = readonly [value: string, unit: string]

const DASH = '—'
const MINUS = '−'

const TAGS: Record<Locale, string> = { en: 'en-US', ru: 'ru-RU' }

interface Formats {
  integer: Intl.NumberFormat
  oneDecimal: Intl.NumberFormat
  twoDecimals: Intl.NumberFormat
  date: Intl.DateTimeFormat
}

const cache = new Map<Locale, Formats>()

function formats(): Formats {
  const locale = currentLocale()
  let result = cache.get(locale)
  if (!result) {
    const tag = TAGS[locale]
    const fixed = (digits: number) =>
      new Intl.NumberFormat(tag, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      })
    result = {
      integer: new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }),
      oneDecimal: fixed(1),
      twoDecimals: fixed(2),
      date: new Intl.DateTimeFormat(tag, {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    }
    cache.set(locale, result)
  }
  return result
}

export const joinParts = ([value, unit]: Parts) =>
  unit ? `${value} ${unit}` : value

export function distanceParts(meters: number | null): Parts {
  if (meters === null) return [DASH, '']
  const { integer, oneDecimal, twoDecimals } = formats()
  if (meters < 1000) return [integer.format(meters), t('units.m')]
  return [
    meters < 100_000
      ? twoDecimals.format(meters / 1000)
      : oneDecimal.format(meters / 1000),
    t('units.km')
  ]
}

export function elevationParts(meters: number | null, signed = false): Parts {
  if (meters === null) return [DASH, '']
  const sign = signed
    ? meters > 0
      ? '+'
      : meters < 0
        ? MINUS
        : ''
    : meters < 0
      ? MINUS
      : ''
  return [sign + formats().integer.format(Math.abs(meters)), t('units.m')]
}

export function speedParts(metersPerSecond: number | null): Parts {
  if (metersPerSecond === null) return [DASH, '']
  return [formats().oneDecimal.format(metersPerSecond * 3.6), t('units.kmh')]
}

export function gradeParts(grade: number | null): Parts {
  if (grade === null) return [DASH, '']
  const percent = Math.round(grade * 100)
  return [
    (percent > 0 ? '+' : percent < 0 ? MINUS : '') + String(Math.abs(percent)),
    '%'
  ]
}

const decimals = new Map<string, Intl.NumberFormat>()

/** A plain number with a fixed number of decimals, e.g. `1.25` / `1,25`. */
export function formatDecimal(value: number, digits: number) {
  const locale = currentLocale()
  const key = `${locale}:${digits}`
  let format = decimals.get(key)
  if (!format) {
    format = new Intl.NumberFormat(TAGS[locale], {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    })
    decimals.set(key, format)
  }
  return format.format(value)
}

/** `1:54:12`, or `54:12` under an hour. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return DASH
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// 24-hour clocks look the same in every supported language
const clock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})
const shortClock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})
const offset = new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' })

export const formatClock = (ms: number | null, seconds = true) =>
  ms === null ? DASH : (seconds ? clock : shortClock).format(ms)

/** `19 JUL 2025` / `19 ИЮЛ 2025`: day, month, year, nothing else. */
export function formatDate(ms: number | null): string {
  if (ms === null) return DASH
  const parts = formats().date.formatToParts(ms)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${part('day')} ${part('month').replace(/\.$/, '')} ${part('year')}`.toUpperCase()
}

/** Viewer's UTC offset at `ms`, e.g. `GMT+2`. */
export function timezoneLabel(ms: number | null): string {
  if (ms === null) return ''
  return (
    offset.formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? ''
  )
}

// Coordinates keep the international notation (decimal point, N/S/E/W) in
// every language, as GPS devices and other maps show them: easy to copy.
export function formatLat(lat: number, digits = 5): string {
  return `${Math.abs(lat).toFixed(digits)}°${lat >= 0 ? 'N' : 'S'}`
}

export function formatLon(lon: number, digits = 5): string {
  return `${Math.abs(lon).toFixed(digits)}°${lon >= 0 ? 'E' : 'W'}`
}

export const formatCount = (n: number) => formats().integer.format(n)

export function formatBytes(bytes: number): string {
  const { oneDecimal } = formats()
  if (bytes < 1024) return `${bytes} ${t('units.b')}`
  if (bytes < 1024 ** 2)
    return `${oneDecimal.format(bytes / 1024)} ${t('units.kb')}`
  return `${oneDecimal.format(bytes / 1024 ** 2)} ${t('units.mb')}`
}
