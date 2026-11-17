import { TZDate } from '@date-fns/tz'
import type { DayRange } from '@/lib/types'

export const CELL_MINUTES = 10
export const CELLS_PER_ROW = 6
const CELL_MS = CELL_MINUTES * 60_000

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)

export function cellCount(range: DayRange): number {
  return Math.round((range.end.getTime() - range.start.getTime()) / CELL_MS)
}

export function cellStart(range: DayRange, i: number): Date {
  return new Date(range.start.getTime() + i * CELL_MS)
}

export function rangeFromCells(
  range: DayRange,
  a: number,
  b: number,
): { start: Date; end: Date } {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return { start: cellStart(range, lo), end: cellStart(range, hi + 1) }
}

export function cellFromPoint(
  rect: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
  count: number,
): number {
  const rows = Math.ceil(count / CELLS_PER_ROW)
  const col = clamp(Math.floor(((x - rect.left) / rect.width) * CELLS_PER_ROW), 0, CELLS_PER_ROW - 1)
  const row = clamp(Math.floor(((y - rect.top) / rect.height) * rows), 0, rows - 1)
  return clamp(row * CELLS_PER_ROW + col, 0, count - 1)
}

export function isOnGrid(range: DayRange, start: Date, end: Date): boolean {
  const s = start.getTime()
  const e = end.getTime()
  if (e <= s) return false
  if (s < range.start.getTime() || e > range.end.getTime()) return false
  return (s - range.start.getTime()) % CELL_MS === 0 && (e - range.start.getTime()) % CELL_MS === 0
}

export function rowLabel(range: DayRange, row: number, tz: string): string {
  const local = new TZDate(cellStart(range, row * CELLS_PER_ROW).getTime(), tz)
  return String(local.getHours() % 12 || 12)
}
