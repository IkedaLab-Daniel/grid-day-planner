import type { SupabaseClient } from '@supabase/supabase-js'
import { cellStart, cellIndexOf, isOnGrid } from '@/lib/grid/grid'
import { listActivities } from '@/lib/db/activities'
import { listBlocks, saveBlock } from '@/lib/db/blocks'
import { dateKeyOf, dayRangeFor, shiftDateKey } from '@/lib/time/day'
import { ceilToCell, floorToCell, formatLocalTime, resolveLocalTime } from '@/lib/chat/time'
import { matchActivity } from '@/lib/chat/matchActivity'
import type { Activity, Block, Category, DayRange, Kind, Profile } from '@/lib/types'

export interface ToolContext {
  sb: SupabaseClient
  userId: string
  profile: Profile
  now: Date
}

/** A block as the model sees it: times are `HH:mm` in the user's timezone. */
export interface BlockView {
  id: string
  activity: string
  kind: Kind
  start: string
  end: string
}

export type ToolErrorCode =
  | 'ACTIVITY_NOT_FOUND'
  | 'ACTIVITY_AMBIGUOUS'
  | 'GAP'
  | 'INVALID_TIME'
  | 'NO_ACTUAL_BLOCK'
  | 'NOT_FOUND'
  | 'EXISTS'
  | 'INVALID_NAME'

export type ToolError = { ok: false; error: ToolErrorCode; [detail: string]: unknown }

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

export const invalidTime = (field: string, reason: string): ToolError => ({
  ok: false,
  error: 'INVALID_TIME',
  field,
  reason,
})

export function todayKey(ctx: ToolContext): string {
  return dateKeyOf(ctx.now, ctx.profile.timezone, ctx.profile.dayStart)
}

/** The grid day for `date` (default today). A malformed, impossible or future date is INVALID_TIME. */
export function resolveDay(
  ctx: ToolContext,
  date?: string,
): { dayKey: string; range: DayRange } | ToolError {
  const today = todayKey(ctx)
  const dayKey = date ?? today
  if (!DATE_KEY.test(dayKey) || shiftDateKey(dayKey, 0) !== dayKey) {
    return invalidTime('date', 'date must be a real YYYY-MM-DD day')
  }
  if (dayKey > today) return invalidTime('date', 'that day has not started yet')
  return { dayKey, range: dayRangeFor(dayKey, ctx.profile.timezone, ctx.profile.dayStart) }
}

export function toView(block: Block, activities: Activity[], tz: string): BlockView {
  return {
    id: block.id,
    activity: activities.find((a) => a.id === block.activityId)?.name ?? '(unknown)',
    kind: block.kind,
    start: formatLocalTime(block.startAt, tz),
    end: formatLocalTime(block.endAt, tz),
  }
}

const byStart = (a: Block, b: Block) => a.startAt.getTime() - b.startAt.getTime()

export async function getDay(
  ctx: ToolContext,
  args: { date?: string },
): Promise<
  | {
      ok: true
      date: string
      actual: BlockView[]
      plan: BlockView[]
      activities: { name: string; category: Category; archived: boolean }[]
    }
  | ToolError
> {
  const day = resolveDay(ctx, args.date)
  if ('ok' in day) return day
  const [blocks, activities] = await Promise.all([listBlocks(ctx.sb, day.range), listActivities(ctx.sb)])
  const view = (kind: Kind) =>
    blocks
      .filter((b) => b.kind === kind)
      .sort(byStart)
      .map((b) => toView(b, activities, ctx.profile.timezone))
  return {
    ok: true,
    date: day.dayKey,
    actual: view('actual'),
    plan: view('plan'),
    activities: activities.map((a) => ({ name: a.name, category: a.category, archived: !!a.archivedAt })),
  }
}

export async function logActivity(
  ctx: ToolContext,
  args: { activity: string; start: string; end?: string; date?: string; gap?: 'skip' },
): Promise<{ ok: true; block: BlockView } | ToolError> {
  const day = resolveDay(ctx, args.date)
  if ('ok' in day) return day
  const { dayKey, range } = day
  const tz = ctx.profile.timezone

  const activities = await listActivities(ctx.sb)
  const match = matchActivity(args.activity, activities)
  if (match.kind === 'none') return { ok: false, error: 'ACTIVITY_NOT_FOUND', names: match.names }
  if (match.kind === 'ambiguous') return { ok: false, error: 'ACTIVITY_AMBIGUOUS', names: match.names }

  const startInstant = resolveLocalTime(dayKey, args.start, ctx.profile)
  if (!startInstant) return invalidTime('start', 'not a valid HH:mm time on that day')
  if (startInstant.getTime() > ctx.now.getTime()) return invalidTime('start', 'start is in the future')
  const start = floorToCell(range, startInstant)

  const nowCeil = ceilToCell(range, ctx.now)
  let end: Date
  if (args.end !== undefined) {
    const endInstant = resolveLocalTime(dayKey, args.end, ctx.profile)
    if (!endInstant) return invalidTime('end', 'not a valid HH:mm time on that day')
    end = ceilToCell(range, endInstant)
  } else if (dayKey === todayKey(ctx)) {
    end = nowCeil.getTime() > start.getTime() ? nowCeil : cellStart(range, cellIndexOf(range, start) + 1)
  } else {
    return invalidTime('end', 'end is required when logging a past day')
  }
  if (end.getTime() <= start.getTime()) return invalidTime('end', 'end must be after start')
  if (end.getTime() > nowCeil.getTime()) return invalidTime('end', 'end is in the future')
  if (!isOnGrid(range, start, end)) return invalidTime('end', 'the block does not fit on that day')

  if (args.gap !== 'skip') {
    const actual = (await listBlocks(ctx.sb, range)).filter((b) => b.kind === 'actual')
    const earlier = actual.filter((b) => b.endAt.getTime() <= start.getTime())
    if (earlier.length > 0) {
      const prevEnd = new Date(Math.max(...earlier.map((b) => b.endAt.getTime())))
      if (prevEnd.getTime() < start.getTime()) {
        return { ok: false, error: 'GAP', from: formatLocalTime(prevEnd, tz), to: formatLocalTime(start, tz) }
      }
    }
  }

  await saveBlock(ctx.sb, ctx.userId, ctx.profile, {
    activityId: match.activity.id,
    kind: 'actual',
    startAt: start,
    endAt: end,
    source: 'ai',
  })

  const saved = (await listBlocks(ctx.sb, range)).find(
    (b) => b.kind === 'actual' && b.activityId === match.activity.id && b.startAt.getTime() === start.getTime(),
  )
  return {
    ok: true,
    block: saved
      ? toView(saved, activities, tz)
      : { id: '', activity: match.activity.name, kind: 'actual', start: formatLocalTime(start, tz), end: formatLocalTime(end, tz) },
  }
}
