import { describe, test, expect } from 'vitest'
import { dayRangeFor, dateKeyOf, shiftDateKey } from '@/lib/time/day'

const hours = (r: { start: Date; end: Date }) =>
  (r.end.getTime() - r.start.getTime()) / 3.6e6

describe('dayRangeFor', () => {
  test('UTC day runs 05:00 to 05:00 next day', () => {
    const r = dayRangeFor('2026-08-16', 'UTC', '05:00')
    expect(r.start.toISOString()).toBe('2026-08-16T05:00:00.000Z')
    expect(r.end.toISOString()).toBe('2026-08-17T05:00:00.000Z')
  })

  test('custom day start 06:30 is honoured', () => {
    expect(dayRangeFor('2026-08-16', 'UTC', '06:30').start.toISOString()).toBe(
      '2026-08-16T06:30:00.000Z',
    )
  })

  test('spring-forward day is 23 hours', () => {
    expect(hours(dayRangeFor('2026-03-07', 'America/New_York', '05:00'))).toBe(23)
  })

  test('fall-back day is 25 hours', () => {
    expect(hours(dayRangeFor('2026-10-31', 'America/New_York', '05:00'))).toBe(25)
  })
})

describe('dateKeyOf', () => {
  test('01:00 local belongs to the previous day', () => {
    expect(dateKeyOf(new Date('2026-08-17T01:00:00Z'), 'UTC', '05:00')).toBe('2026-08-16')
  })

  test('exactly the day start begins the new day', () => {
    expect(dateKeyOf(new Date('2026-08-17T05:00:00Z'), 'UTC', '05:00')).toBe('2026-08-17')
  })
})

describe('shiftDateKey', () => {
  test('crosses a month forward', () => {
    expect(shiftDateKey('2026-08-31', 1)).toBe('2026-09-01')
  })

  test('crosses a month backward', () => {
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28')
  })
})
