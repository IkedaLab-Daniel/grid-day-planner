import { describe, test, expect } from 'vitest'
import { dayRangeFor } from '@/lib/time/day'
import {
  isHHmm,
  resolveLocalTime,
  resolveEnd,
  MAX_WRAPPED_BLOCK_HOURS,
  floorToCell,
  ceilToCell,
  formatLocalTime,
  describeNow,
} from '@/lib/chat/time'
import type { Profile } from '@/lib/types'

const utc: Profile = { timezone: 'UTC', dayStart: '05:00' }
const tokyo: Profile = { timezone: 'Asia/Tokyo', dayStart: '05:00' }
const ny: Profile = { timezone: 'America/New_York', dayStart: '05:00' }
const iso = (d: Date | null) => d?.toISOString() ?? null

describe('isHHmm', () => {
  test.each(['00:00', '05:00', '16:10', '23:59'])('%s is valid', (s) => expect(isHHmm(s)).toBe(true))
  test.each(['4:10', '24:00', '12:60', 'abc', ''])('%s is invalid', (s) => expect(isHHmm(s)).toBe(false))
})

describe('resolveLocalTime', () => {
  test('a daytime wall time on the day key', () => {
    expect(iso(resolveLocalTime('2026-08-16', '16:10', utc))).toBe('2026-08-16T16:10:00.000Z')
    expect(iso(resolveLocalTime('2026-08-16', '05:00', utc))).toBe('2026-08-16T05:00:00.000Z')
  })

  test('after midnight belongs to the next calendar date of the same grid day', () => {
    expect(iso(resolveLocalTime('2026-08-16', '01:30', utc))).toBe('2026-08-17T01:30:00.000Z')
    expect(iso(resolveLocalTime('2026-08-16', '04:59', utc))).toBe('2026-08-17T04:59:00.000Z')
  })

  test('uses the profile timezone', () => {
    expect(iso(resolveLocalTime('2026-08-16', '16:10', tokyo))).toBe('2026-08-16T07:10:00.000Z')
  })

  test.each(['abc', '25:00', '4:10'])('%s is null', (s) => {
    expect(resolveLocalTime('2026-08-16', s, utc)).toBeNull()
  })

  test('a wall time skipped by spring-forward is null', () => {
    expect(resolveLocalTime('2026-03-07', '02:30', ny)).toBeNull()
  })

  test('a wall time repeated by fall-back resolves to its first occurrence', () => {
    expect(iso(resolveLocalTime('2026-10-31', '01:30', ny))).toBe('2026-11-01T05:30:00.000Z')
  })
})

describe('floorToCell / ceilToCell', () => {
  const range = dayRangeFor('2026-08-16', 'UTC', '05:00')
  const at = (s: string) => new Date(`2026-08-16T${s}Z`)

  test('mid-cell instants', () => {
    expect(iso(floorToCell(range, at('16:12:00')))).toBe('2026-08-16T16:10:00.000Z')
    expect(iso(ceilToCell(range, at('16:12:00')))).toBe('2026-08-16T16:20:00.000Z')
  })

  test('an exact boundary stays put', () => {
    expect(iso(floorToCell(range, at('16:10:00')))).toBe('2026-08-16T16:10:00.000Z')
    expect(iso(ceilToCell(range, at('16:10:00')))).toBe('2026-08-16T16:10:00.000Z')
  })

  test('seconds past a boundary round up for ceil', () => {
    expect(iso(floorToCell(range, at('16:10:30')))).toBe('2026-08-16T16:10:00.000Z')
    expect(iso(ceilToCell(range, at('16:10:30')))).toBe('2026-08-16T16:20:00.000Z')
  })
})

describe('formatLocalTime', () => {
  test('formats HH:mm in the timezone', () => {
    expect(formatLocalTime(new Date('2026-08-16T07:10:00Z'), 'Asia/Tokyo')).toBe('16:10')
  })
  test('midnight is 00:05, not 24:05', () => {
    expect(formatLocalTime(new Date('2026-08-16T00:05:00Z'), 'UTC')).toBe('00:05')
  })
})

describe('describeNow', () => {
  test('weekday, date and time in the timezone', () => {
    expect(describeNow(new Date('2026-11-18T07:12:00Z'), 'Asia/Tokyo')).toBe('Wednesday 2026-11-18 16:12')
  })
})

describe('resolveEnd', () => {
  const at = (s: string) => new Date(s)
  const midnightStart: Profile = { timezone: 'UTC', dayStart: '00:00' }

  test('an end later in the same grid day', () => {
    expect(iso(resolveEnd('2026-08-16', at('2026-08-16T16:10:00Z'), '17:00', utc))).toBe('2026-08-16T17:00:00.000Z')
  })

  test('midnight as an end after a late start (05:00 day start): the next calendar date, same grid day', () => {
    expect(iso(resolveEnd('2026-08-16', at('2026-08-16T22:00:00Z'), '00:00', utc))).toBe('2026-08-17T00:00:00.000Z')
  })

  test('midnight as an end with a 00:00 day start is the day boundary itself', () => {
    expect(iso(resolveEnd('2026-08-16', at('2026-08-16T22:00:00Z'), '00:00', midnightStart))).toBe('2026-08-17T00:00:00.000Z')
  })

  test('an end that crosses the day boundary: 23:30 to 06:30 with a 05:00 day start', () => {
    expect(iso(resolveEnd('2026-08-16', at('2026-08-16T23:30:00Z'), '06:30', utc))).toBe('2026-08-17T06:30:00.000Z')
  })

  test('an end at or before the start is null, not a 23-hour block', () => {
    expect(resolveEnd('2026-08-16', at('2026-08-16T16:10:00Z'), '16:10', utc)).toBeNull()
    expect(resolveEnd('2026-08-16', at('2026-08-16T12:00:00Z'), '11:00', utc)).toBeNull()
    expect(MAX_WRAPPED_BLOCK_HOURS).toBe(16)
  })

  test('malformed or skipped wall times are null', () => {
    expect(resolveEnd('2026-08-16', at('2026-08-16T16:10:00Z'), 'soon', utc)).toBeNull()
  })
})
