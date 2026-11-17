import type { Block, DayRange } from '@/lib/types'

export type Totals = Record<string, { plannedMin: number; actualMin: number; diffMin: number }>

export function computeTotals(blocks: Block[], range: DayRange): Totals {
  const totals: Totals = {}
  for (const b of blocks) {
    const s = Math.max(b.startAt.getTime(), range.start.getTime())
    const e = Math.min(b.endAt.getTime(), range.end.getTime())
    if (e <= s) continue
    const minutes = (e - s) / 60_000
    const t = (totals[b.activityId] ??= { plannedMin: 0, actualMin: 0, diffMin: 0 })
    if (b.kind === 'plan') t.plannedMin += minutes
    else t.actualMin += minutes
    t.diffMin = t.actualMin - t.plannedMin
  }
  return totals
}
