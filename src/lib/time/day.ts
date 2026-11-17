import { TZDate } from '@date-fns/tz'
import type { DayRange } from '@/lib/types'

function parseKey(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number)
  return [y, m, d]
}

function parseTime(hhmm: string): [number, number] {
  const [h, m] = hhmm.split(':').map(Number)
  return [h, m]
}

const pad = (n: number) => String(n).padStart(2, '0')

export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = parseKey(key)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function dayRangeFor(dateKey: string, tz: string, dayStart: string): DayRange {
  const [y, m, d] = parseKey(dateKey)
  const [hh, mm] = parseTime(dayStart)
  const start = new TZDate(y, m - 1, d, hh, mm, 0, 0, tz)
  const end = new TZDate(y, m - 1, d + 1, hh, mm, 0, 0, tz)
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) }
}

export function dateKeyOf(instant: Date, tz: string, dayStart: string): string {
  const local = new TZDate(instant.getTime(), tz)
  const localKey = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`
  const [hh, mm] = parseTime(dayStart)
  const beforeStart = local.getHours() * 60 + local.getMinutes() < hh * 60 + mm
  return beforeStart ? shiftDateKey(localKey, -1) : localKey
}
