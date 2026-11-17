import type { Block, NewBlock } from '@/lib/types'

export interface PaintResult {
  deleteIds: string[]
  updates: Block[]
  inserts: NewBlock[]
}

/**
 * Replace the part of same-kind blocks covered by `paint`, then add `paint`.
 * Blocks of the other kind and blocks that merely touch are left alone.
 */
export function paintBlocks(existing: Block[], paint: NewBlock): PaintResult {
  const result: PaintResult = { deleteIds: [], updates: [], inserts: [] }
  const ps = paint.startAt.getTime()
  const pe = paint.endAt.getTime()

  for (const b of existing) {
    if (b.kind !== paint.kind) continue
    const bs = b.startAt.getTime()
    const be = b.endAt.getTime()
    if (bs >= pe || be <= ps) continue

    const startsBefore = bs < ps
    const endsAfter = be > pe

    if (!startsBefore && !endsAfter) {
      result.deleteIds.push(b.id)
    } else if (startsBefore && endsAfter) {
      result.updates.push({ ...b, endAt: paint.startAt })
      result.inserts.push({
        activityId: b.activityId,
        kind: b.kind,
        startAt: paint.endAt,
        endAt: b.endAt,
        source: b.source,
      })
    } else if (startsBefore) {
      result.updates.push({ ...b, endAt: paint.startAt })
    } else {
      result.updates.push({ ...b, startAt: paint.endAt })
    }
  }

  result.inserts.push(paint)
  return result
}
