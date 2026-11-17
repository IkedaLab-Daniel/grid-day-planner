import { describe, test, expect } from 'vitest'
import { computeTotals } from '@/lib/blocks/totals'
import { dayRangeFor } from '@/lib/time/day'
import type { Block } from '@/lib/types'

const utc = dayRangeFor('2026-08-16', 'UTC', '05:00')
const mk = (id: string, kind: Block['kind'], from: string, to: string, activityId = 'A'): Block => ({
  id,
  activityId,
  kind,
  startAt: new Date(from),
  endAt: new Date(to),
  source: 'manual',
})

describe('computeTotals', () => {
  test('diff is actual minus planned', () => {
    const t = computeTotals(
      [
        mk('1', 'plan', '2026-08-16T09:00:00Z', '2026-08-16T11:00:00Z'),
        mk('2', 'actual', '2026-08-16T09:00:00Z', '2026-08-16T10:20:00Z'),
      ],
      utc,
    )
    expect(t.A).toEqual({ plannedMin: 120, actualMin: 80, diffMin: -40 })
  })

  test('only the part inside the range counts', () => {
    const t = computeTotals([mk('1', 'plan', '2026-08-16T04:00:00Z', '2026-08-16T06:00:00Z')], utc)
    expect(t.A.plannedMin).toBe(60)
  })

  test('an activity with only actual blocks has zero planned', () => {
    const t = computeTotals([mk('1', 'actual', '2026-08-16T09:00:00Z', '2026-08-16T09:30:00Z', 'Z')], utc)
    expect(t.Z).toEqual({ plannedMin: 0, actualMin: 30, diffMin: 30 })
  })

  test('a full block on the 25-hour fall-back day is 1500 minutes', () => {
    const ny = dayRangeFor('2026-10-31', 'America/New_York', '05:00')
    const full: Block = { ...mk('1', 'plan', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z'), startAt: ny.start, endAt: ny.end }
    expect(computeTotals([full], ny).A.plannedMin).toBe(1500)
  })
})
