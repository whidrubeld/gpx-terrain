import { afterEach, describe, expect, it } from 'vitest'

import { setSetting } from '../state/settings'
import {
  distanceParts,
  elevationParts,
  formatBytes,
  formatDate,
  formatDecimal,
  formatLat,
  gradeParts,
  joinParts,
  speedParts
} from './format'

// Intl groups Russian digits with non-breaking spaces: plain ones for reading
const plain = (text: string) => text.replace(/\s/g, ' ')

describe('format', () => {
  afterEach(() => setSetting('language', 'auto'))

  it('formats in English', () => {
    setSetting('language', 'en')
    expect(joinParts(distanceParts(850))).toBe('850 M')
    expect(joinParts(distanceParts(23_866))).toBe('23.87 KM')
    expect(joinParts(distanceParts(123_456))).toBe('123.5 KM')
    expect(joinParts(elevationParts(2325))).toBe('2,325 M')
    expect(joinParts(elevationParts(-12, true))).toBe('−12 M')
    expect(joinParts(speedParts(10))).toBe('36.0 KM/H')
    expect(joinParts(gradeParts(0.2))).toBe('+20 %')
    expect(formatDate(Date.UTC(2025, 6, 19, 12))).toBe('19 JUL 2025')
    expect(formatDecimal(1.25, 2)).toBe('1.25')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats in Russian', () => {
    setSetting('language', 'ru')
    expect(joinParts(distanceParts(850))).toBe('850 М')
    expect(joinParts(distanceParts(23_866))).toBe('23,87 КМ')
    expect(plain(joinParts(elevationParts(2325)))).toBe('2 325 М')
    expect(joinParts(speedParts(10))).toBe('36,0 КМ/Ч')
    expect(formatDate(Date.UTC(2025, 6, 19, 12))).toBe('19 ИЮЛ 2025')
    expect(formatDecimal(1.25, 2)).toBe('1,25')
    expect(formatBytes(603)).toBe('603 Б')
  })

  it('keeps coordinates international', () => {
    setSetting('language', 'ru')
    expect(formatLat(46.5754)).toBe('46.57540°N')
    expect(formatLat(-33.9, 1)).toBe('33.9°S')
  })
})
