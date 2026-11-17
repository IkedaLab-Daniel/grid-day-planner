import { describe, test, expect } from 'vitest'
import { isValidTimezone, isValidDayStart, isValidHexColor, isValidActivityName } from '@/lib/settings/validate'

describe('isValidTimezone', () => {
  test('accepts an IANA zone', () => expect(isValidTimezone('America/New_York')).toBe(true))
  test('rejects nonsense', () => expect(isValidTimezone('Mars/Base')).toBe(false))
  test('rejects empty', () => expect(isValidTimezone('')).toBe(false))
})

describe('isValidDayStart', () => {
  test.each(['05:00', '00:00', '23:59'])('%s is valid', (s) => expect(isValidDayStart(s)).toBe(true))
  test.each(['5:00', '24:00', '05:60', '0500', ''])('%s is invalid', (s) => expect(isValidDayStart(s)).toBe(false))
})

describe('isValidHexColor', () => {
  test('accepts #RRGGBB', () => expect(isValidHexColor('#7CB342')).toBe(true))
  test.each(['7CB342', '#7CB34', 'red', ''])('%s is invalid', (s) => expect(isValidHexColor(s)).toBe(false))
})

describe('isValidActivityName', () => {
  test('accepts a normal name', () => expect(isValidActivityName('QR SaaS')).toBe(true))
  test('rejects blank and over-long names', () => {
    expect(isValidActivityName('   ')).toBe(false)
    expect(isValidActivityName('x'.repeat(41))).toBe(false)
  })
})
