import { describe, test, expect } from 'vitest'
import { splitAtDayBoundaries } from '@/lib/blocks/boundary'
import type { NewBlock } from '@/lib/types'

const mk = (from: string, to: string): NewBlock => ({
  activityId: 'A',
  kind: 'actual',
  startAt: new Date(from),
  endAt: new Date(to),
  source: 'manual',
})
const iso = (b: NewBlock) => [b.startAt.toISOString(), b.endAt.toISOString()]

describe('splitAtDayBoundaries', () => {
  test('a block across the day start is split in two', () => {
    const out = splitAtDayBoundaries(mk('2026-08-17T04:50:00Z', '2026-08-17T05:20:00Z'), 'UTC', '05:00')
    expect(out.map(iso)).toEqual([
      ['2026-08-17T04:50:00.000Z', '2026-08-17T05:00:00.000Z'],
      ['2026-08-17T05:00:00.000Z', '2026-08-17T05:20:00.000Z'],
    ])
  })

  test('a block inside one day is returned unchanged', () => {
    const b = mk('2026-08-16T09:00:00Z', '2026-08-16T10:00:00Z')
    expect(splitAtDayBoundaries(b, 'UTC', '05:00')).toEqual([b])
  })

  test('a block spanning two boundaries yields three pieces', () => {
    const out = splitAtDayBoundaries(mk('2026-08-16T06:00:00Z', '2026-08-18T06:00:00Z'), 'UTC', '05:00')
    expect(out).toHaveLength(3)
  })
})
