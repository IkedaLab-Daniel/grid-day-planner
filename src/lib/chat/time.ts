import { TZDate } from '@date-fns/tz'
import { CELL_MINUTES, cellIndexOf, cellStart } from '@/lib/grid/grid'
import { dayRangeFor, shiftDateKey } from '@/lib/time/day'
import type { DayRange, Profile } from '@/lib/types'

const CELL_MS = CELL_MINUTES * 60_000
const pad = (n: number) => String(n).padStart(2, '0')

export function isHHmm(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

export function formatLocalTime(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  }).format(instant)
}

/**
 * The instant of wall time `hhmm` within the grid day `dayKey`. A grid day runs from the
 * day start to the same time next day, so early-morning times fall on the next calendar date.
 * Null if malformed, skipped by a DST change, or outside the day. A repeated hour resolves
 * to its first occurrence.
 */
export function resolveLocalTime(dayKey: string, hhmm: string, profile: Profile): Date | null {
  if (!isHHmm(hhmm)) return null
  const { timezone: tz, dayStart } = profile
  const range = dayRangeFor(dayKey, tz, dayStart)
  const [hh, mm] = hhmm.split(':').map(Number)

  const candidates: Date[] = []
  for (const key of [dayKey, shiftDateKey(dayKey, 1)]) {
    const [y, m, d] = key.split('-').map(Number)
    const instant = new Date(new TZDate(y, m - 1, d, hh, mm, 0, 0, tz).getTime())
    const inRange = instant >= range.start && instant < range.end
    if (inRange && formatLocalTime(instant, tz) === hhmm) candidates.push(instant)
  }
  candidates.sort((a, b) => a.getTime() - b.getTime())
  return candidates[0] ?? null
}

/** The longest block an end time may reach by wrapping past the day boundary (e.g. sleep). */
export const MAX_WRAPPED_BLOCK_HOURS = 16

/**
 * The instant of an end time for a block that starts at `start` on grid day `dayKey`.
 * Normally it is the wall time later in the same grid day; if that is not after the start
 * (e.g. start 23:30, end "06:30" with a 05:00 day start) it wraps into the next grid day, but
 * only up to MAX_WRAPPED_BLOCK_HOURS so a mistyped earlier time never becomes a 23-hour block.
 * Null if malformed, skipped by DST, equal to or before the start, or too long when wrapped.
 */
export function resolveEnd(dayKey: string, start: Date, hhmm: string, profile: Profile): Date | null {
  const sameDay = resolveLocalTime(dayKey, hhmm, profile)
  if (sameDay && sameDay.getTime() > start.getTime()) return sameDay
  const wrapped = resolveLocalTime(shiftDateKey(dayKey, 1), hhmm, profile)
  const longest = MAX_WRAPPED_BLOCK_HOURS * 3600_000
  if (wrapped && wrapped.getTime() > start.getTime() && wrapped.getTime() - start.getTime() <= longest) return wrapped
  return null
}

export function floorToCell(range: DayRange, instant: Date): Date {
  return cellStart(range, cellIndexOf(range, instant))
}

export function ceilToCell(range: DayRange, instant: Date): Date {
  return cellStart(range, Math.ceil((instant.getTime() - range.start.getTime()) / CELL_MS))
}

export function describeNow(instant: Date, tz: string): string {
  const local = new TZDate(instant.getTime(), tz)
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tz }).format(instant)
  const date = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`
  return `${weekday} ${date} ${formatLocalTime(instant, tz)}`
}
