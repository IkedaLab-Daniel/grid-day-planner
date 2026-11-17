import { describe, test, expect } from 'vitest'
import { formatMinutes, formatDiff } from '@/lib/format'

describe('formatMinutes', () => {
  test.each([
    [0, '0m'],
    [40, '40m'],
    [80, '1h 20m'],
    [120, '2h'],
  ])('%i -> %s', (m, s) => expect(formatMinutes(m)).toBe(s))
})

describe('formatDiff', () => {
  test.each([
    [0, '0m'],
    [-40, '-40m'],
    [90, '+1h 30m'],
  ])('%i -> %s', (m, s) => expect(formatDiff(m)).toBe(s))
})
