import { dateKeyOf, dayRangeFor } from '@/lib/time/day'
import type { NewBlock } from '@/lib/types'

/** Split a block so that no piece crosses a day boundary. */
export function splitAtDayBoundaries(block: NewBlock, tz: string, dayStart: string): NewBlock[] {
  const pieces: NewBlock[] = []
  let cursor = block.startAt
  while (cursor.getTime() < block.endAt.getTime()) {
    const range = dayRangeFor(dateKeyOf(cursor, tz, dayStart), tz, dayStart)
    const end = range.end.getTime() < block.endAt.getTime() ? range.end : block.endAt
    pieces.push({ ...block, startAt: cursor, endAt: end })
    cursor = end
  }
  return pieces
}
