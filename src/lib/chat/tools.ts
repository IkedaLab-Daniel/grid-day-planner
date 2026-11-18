import type { SupabaseClient } from '@supabase/supabase-js'
import { cellStart, cellIndexOf, isOnGrid } from '@/lib/grid/grid'
import { createActivity, listActivities } from '@/lib/db/activities'
import { deleteBlock, getBlock, listBlocks, moveBlock, saveBlock } from '@/lib/db/blocks'
import { dateKeyOf, dayRangeFor, shiftDateKey } from '@/lib/time/day'
import { MAX_WRAPPED_BLOCK_HOURS, ceilToCell, floorToCell, formatLocalTime, isHHmm, resolveEnd, resolveLocalTime } from '@/lib/chat/time'
import { matchActivity, normaliseName } from '@/lib/chat/matchActivity'
import { pickColor } from '@/lib/chat/palette'
import { CATEGORIES } from '@/lib/settings/parse'
import { isValidActivityName } from '@/lib/settings/validate'
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

/** An end time for a block starting at `start`, rounded up to a cell. May lie past the day boundary. */
function endFor(ctx: ToolContext, dayKey: string, range: DayRange, start: Date, hhmm: string): Date | ToolError {
  if (!isHHmm(hhmm)) return invalidTime('end', 'not a valid HH:mm time')
  const instant = resolveEnd(dayKey, start, hhmm, ctx.profile)
  if (!instant) {
    return invalidTime(
      'end',
      `end must be after the start (a block that crosses the day boundary can run at most ${MAX_WRAPPED_BLOCK_HOURS} hours)`,
    )
  }
  return ceilToCell(range, instant)
}

/** A block may run past the day end (the write splits it); only the part inside the day must sit on the grid. */
function fitsGrid(range: DayRange, start: Date, end: Date): boolean {
  return isOnGrid(range, start, end.getTime() > range.end.getTime() ? range.end : end)
}

const withEnd = (view: BlockView, end: Date, tz: string): BlockView => ({ ...view, end: formatLocalTime(end, tz) })

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
): Promise<{ ok: true; block: BlockView; unchanged?: true } | ToolError> {
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
    const resolved = endFor(ctx, dayKey, range, start, args.end)
    if ('ok' in resolved) return resolved
    end = resolved
  } else if (dayKey === todayKey(ctx)) {
    end = nowCeil.getTime() > start.getTime() ? nowCeil : cellStart(range, cellIndexOf(range, start) + 1)
  } else {
    return invalidTime('end', 'end is required when logging a past day')
  }
  if (end.getTime() <= start.getTime()) return invalidTime('end', 'end must be after start')
  if (end.getTime() > nowCeil.getTime()) return invalidTime('end', 'end is in the future')
  if (!fitsGrid(range, start, end)) return invalidTime('end', 'the block does not fit on that day')

  const actual = (await listBlocks(ctx.sb, range)).filter((b) => b.kind === 'actual')

  // Logging exactly what is already there changes nothing (and must not trim or duplicate).
  const same = actual.find(
    (b) =>
      b.activityId === match.activity.id &&
      b.startAt.getTime() === start.getTime() &&
      b.endAt.getTime() === end.getTime(),
  )
  if (same) return { ok: true, unchanged: true, block: toView(same, activities, tz) }

  if (args.gap !== 'skip') {
    // Blocks that begin before the new start: if one of them covers the start there is no gap.
    const before = actual.filter((b) => b.startAt.getTime() < start.getTime())
    if (before.length > 0) {
      const prevEnd = new Date(Math.max(...before.map((b) => b.endAt.getTime())))
      if (prevEnd.getTime() < start.getTime()) {
        return {
          ok: false,
          error: 'GAP',
          from: formatLocalTime(prevEnd, tz),
          to: formatLocalTime(start, tz),
          // Exactly what to send again if the user says to leave the gap empty.
          skipWith: { ...args, gap: 'skip' },
        }
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
      ? withEnd(toView(saved, activities, tz), end, tz)
      : { id: '', activity: match.activity.name, kind: 'actual', start: formatLocalTime(start, tz), end: formatLocalTime(end, tz) },
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = (): ToolError => ({ ok: false, error: 'NOT_FOUND' })

/** An actual block by id. Missing, foreign (hidden by RLS), malformed ids and plan blocks are all null. */
async function findActualBlock(ctx: ToolContext, blockId: string): Promise<Block | null> {
  if (!UUID.test(blockId)) return null
  const block = await getBlock(ctx.sb, blockId)
  return block && block.kind === 'actual' ? block : null
}

function dayOf(ctx: ToolContext, block: Block): { dayKey: string; range: DayRange } {
  const { timezone, dayStart } = ctx.profile
  const dayKey = dateKeyOf(block.startAt, timezone, dayStart)
  return { dayKey, range: dayRangeFor(dayKey, timezone, dayStart) }
}

async function reread(
  ctx: ToolContext,
  range: DayRange,
  activityId: string,
  start: Date,
): Promise<BlockView | null> {
  const [blocks, activities] = await Promise.all([listBlocks(ctx.sb, range), listActivities(ctx.sb)])
  const found = blocks.find(
    (b) => b.kind === 'actual' && b.activityId === activityId && b.startAt.getTime() === start.getTime(),
  )
  return found ? toView(found, activities, ctx.profile.timezone) : null
}

export async function setEnd(
  ctx: ToolContext,
  args: { end?: string; blockId?: string },
): Promise<{ ok: true; block: BlockView; unchanged?: true } | ToolError> {
  let target: Block | undefined
  if (args.blockId !== undefined) {
    const found = await findActualBlock(ctx, args.blockId)
    if (!found) return notFound()
    target = found
  } else {
    const day = resolveDay(ctx)
    if ('ok' in day) return day
    const actual = (await listBlocks(ctx.sb, day.range)).filter((b) => b.kind === 'actual')
    target = actual.sort((a, b) => a.endAt.getTime() - b.endAt.getTime()).at(-1)
    if (!target) return { ok: false, error: 'NO_ACTUAL_BLOCK' }
  }

  const { dayKey, range } = dayOf(ctx, target)
  const nowCeil = ceilToCell(range, ctx.now)
  let end: Date
  if (args.end !== undefined) {
    const resolved = endFor(ctx, dayKey, range, target.startAt, args.end)
    if ('ok' in resolved) return resolved
    end = resolved
  } else if (dayKey === todayKey(ctx)) {
    end = nowCeil
  } else {
    return invalidTime('end', 'end is required when changing a block on a past day')
  }
  if (end.getTime() <= target.startAt.getTime()) return invalidTime('end', 'end must be after the start')
  if (end.getTime() > nowCeil.getTime()) return invalidTime('end', 'end is in the future')
  if (!fitsGrid(range, target.startAt, end)) return invalidTime('end', 'the block does not fit on that day')

  const activities = await listActivities(ctx.sb)
  if (end.getTime() === target.endAt.getTime()) {
    return { ok: true, unchanged: true, block: toView(target, activities, ctx.profile.timezone) }
  }
  await moveBlock(ctx.sb, ctx.userId, ctx.profile, target.id, target.startAt, end)
  const view = await reread(ctx, range, target.activityId, target.startAt)
  const tz = ctx.profile.timezone
  return { ok: true, block: withEnd(view ?? toView({ ...target, endAt: end }, activities, tz), end, tz) }
}

export async function editBlock(
  ctx: ToolContext,
  args: { blockId: string; start?: string; end?: string; activity?: string },
): Promise<{ ok: true; block: BlockView; unchanged?: true } | ToolError> {
  const target = await findActualBlock(ctx, args.blockId)
  if (!target) return notFound()
  const { dayKey, range } = dayOf(ctx, target)
  const activities = await listActivities(ctx.sb)

  let activityId = target.activityId
  if (args.activity !== undefined) {
    const match = matchActivity(args.activity, activities)
    if (match.kind === 'none') return { ok: false, error: 'ACTIVITY_NOT_FOUND', names: match.names }
    if (match.kind === 'ambiguous') return { ok: false, error: 'ACTIVITY_AMBIGUOUS', names: match.names }
    activityId = match.activity.id
  }

  let start = target.startAt
  if (args.start !== undefined) {
    const instant = resolveLocalTime(dayKey, args.start, ctx.profile)
    if (!instant) return invalidTime('start', 'not a valid HH:mm time on that day')
    if (instant.getTime() > ctx.now.getTime()) return invalidTime('start', 'start is in the future')
    start = floorToCell(range, instant)
  }
  const nowCeil = ceilToCell(range, ctx.now)
  let end = target.endAt
  if (args.end !== undefined) {
    const resolved = endFor(ctx, dayKey, range, start, args.end)
    if ('ok' in resolved) return resolved
    end = resolved
  }
  if (end.getTime() <= start.getTime()) return invalidTime('end', 'end must be after the start')
  if (end.getTime() > nowCeil.getTime()) return invalidTime('end', 'end is in the future')
  if (!fitsGrid(range, start, end)) return invalidTime('end', 'the block does not fit on that day')

  if (
    activityId === target.activityId &&
    start.getTime() === target.startAt.getTime() &&
    end.getTime() === target.endAt.getTime()
  ) {
    return { ok: true, unchanged: true, block: toView(target, activities, ctx.profile.timezone) }
  }

  await moveBlock(ctx.sb, ctx.userId, ctx.profile, target.id, start, end, activityId)
  const view = await reread(ctx, range, activityId, start)
  const tz = ctx.profile.timezone
  return {
    ok: true,
    block: withEnd(view ?? toView({ ...target, activityId, startAt: start, endAt: end }, activities, tz), end, tz),
  }
}

export async function removeBlock(
  ctx: ToolContext,
  args: { blockId: string },
): Promise<{ ok: true; deleted: BlockView } | ToolError> {
  const target = await findActualBlock(ctx, args.blockId)
  if (!target) return notFound()
  const activities = await listActivities(ctx.sb)
  const deleted = toView(target, activities, ctx.profile.timezone)
  await deleteBlock(ctx.sb, target.id)
  return { ok: true, deleted }
}

export async function createActivityTool(
  ctx: ToolContext,
  args: { name: string; category?: Category },
): Promise<{ ok: true; activity: { name: string; category: Category } } | ToolError> {
  const name = args.name.trim()
  if (!isValidActivityName(name)) return { ok: false, error: 'INVALID_NAME', reason: 'name must be 1-40 characters' }
  const category = args.category ?? 'other'
  if (!CATEGORIES.includes(category)) return { ok: false, error: 'INVALID_NAME', reason: 'unknown category' }

  const activities = await listActivities(ctx.sb)
  if (activities.some((a) => !a.archivedAt && normaliseName(a.name) === normaliseName(name))) {
    return { ok: false, error: 'EXISTS', name }
  }
  const used = activities.flatMap((a) => (a.colorTo ? [a.color, a.colorTo] : [a.color]))
  await createActivity(ctx.sb, ctx.userId, { name, color: pickColor(used), colorTo: null, category })
  return { ok: true, activity: { name, category } }
}
