import { describe, test, expect } from 'vitest'
import { dayRangeFor } from '@/lib/time/day'
import {
  cellCount,
  cellStart,
  rangeFromCells,
  cellFromPoint,
  isOnGrid,
  rowLabel,
} from '@/lib/grid/grid'

const utc = dayRangeFor('2026-08-16', 'UTC', '05:00')
const nySpring = dayRangeFor('2026-03-07', 'America/New_York', '05:00')
const nyFall = dayRangeFor('2026-10-31', 'America/New_York', '05:00')

describe('cellCount', () => {
  test('is 144 for a normal day', () => expect(cellCount(utc)).toBe(144))
  test('is 138 for the 23-hour spring-forward day', () => expect(cellCount(nySpring)).toBe(138))
  test('is 150 for the 25-hour fall-back day', () => expect(cellCount(nyFall)).toBe(150))
})

describe('rangeFromCells', () => {
  test('dragging backward equals dragging forward', () => {
    expect(rangeFromCells(utc, 5, 2)).toEqual(rangeFromCells(utc, 2, 5))
  })

  test('covers both end cells inclusively', () => {
    const r = rangeFromCells(utc, 2, 5)
    expect(r.start).toEqual(cellStart(utc, 2))
    expect(r.end).toEqual(cellStart(utc, 6))
  })

  test('a single cell is exactly 10 minutes', () => {
    const r = rangeFromCells(utc, 3, 3)
    expect(r.end.getTime() - r.start.getTime()).toBe(10 * 60_000)
  })
})

describe('cellFromPoint', () => {
  const rect = { left: 0, top: 0, width: 600, height: 2400 }
  test('maps a point to row-major cell index', () => {
    expect(cellFromPoint(rect, 150, 250, 144)).toBe(13)
  })
  test('clamps points above/left of the grid to cell 0', () => {
    expect(cellFromPoint(rect, -50, -50, 144)).toBe(0)
  })
  test('clamps points below/right of the grid to the last cell', () => {
    expect(cellFromPoint(rect, 9999, 9999, 144)).toBe(143)
  })
})

describe('isOnGrid', () => {
  test('accepts a block aligned to cells inside the range', () => {
    expect(isOnGrid(utc, cellStart(utc, 0), cellStart(utc, 3))).toBe(true)
  })
  test('rejects end <= start', () => {
    expect(isOnGrid(utc, cellStart(utc, 3), cellStart(utc, 3))).toBe(false)
  })
  test('rejects a start 5 minutes off a cell boundary', () => {
    const off = new Date(cellStart(utc, 1).getTime() + 5 * 60_000)
    expect(isOnGrid(utc, off, cellStart(utc, 3))).toBe(false)
  })
  test('rejects an end past the range end', () => {
    const past = new Date(utc.end.getTime() + 10 * 60_000)
    expect(isOnGrid(utc, cellStart(utc, 140), past)).toBe(false)
  })
})

describe('rowLabel', () => {
  test('first row is the day start hour', () => expect(rowLabel(utc, 0, 'UTC')).toBe('5'))
  test('noon row is 12', () => expect(rowLabel(utc, 7, 'UTC')).toBe('12'))
  test('hour after noon is 1', () => expect(rowLabel(utc, 8, 'UTC')).toBe('1'))
})
