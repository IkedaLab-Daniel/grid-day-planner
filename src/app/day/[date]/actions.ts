'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/db/profile'
import { deleteBlock, moveBlock, saveBlock } from '@/lib/db/blocks'
import { cellCount, isOnGrid, rangeFromCells } from '@/lib/grid/grid'
import { dateKeyOf, dayRangeFor } from '@/lib/time/day'
import type { Kind } from '@/lib/types'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

async function context() {
  const sb = await createServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) throw new Error('Not signed in')
  return { sb, userId: user.id, profile: await getProfile(sb) }
}

export async function paintAction(input: {
  dateKey: string
  kind: Kind
  activityId: string
  startCell: number
  endCell: number
}): Promise<void> {
  if (!DATE_KEY.test(input.dateKey)) throw new Error('Invalid date')
  if (input.kind !== 'plan' && input.kind !== 'actual') throw new Error('Invalid kind')
  const { sb, userId, profile } = await context()
  const range = dayRangeFor(input.dateKey, profile.timezone, profile.dayStart)
  const count = cellCount(range)
  for (const c of [input.startCell, input.endCell]) {
    if (!Number.isInteger(c) || c < 0 || c >= count) throw new Error('Cell out of range')
  }
  const { start, end } = rangeFromCells(range, input.startCell, input.endCell)
  await saveBlock(sb, userId, profile, {
    activityId: input.activityId,
    kind: input.kind,
    startAt: start,
    endAt: end,
    source: 'manual',
  })
  revalidatePath(`/day/${input.dateKey}`)
}

export async function updateBlockAction(input: { id: string; startAt: string; endAt: string }): Promise<void> {
  const { sb, userId, profile } = await context()
  const startAt = new Date(input.startAt)
  const endAt = new Date(input.endAt)
  const dateKey = dateKeyOf(startAt, profile.timezone, profile.dayStart)
  const range = dayRangeFor(dateKey, profile.timezone, profile.dayStart)
  if (!isOnGrid(range, startAt, endAt)) throw new Error('Block is not on the grid for that day')
  await moveBlock(sb, userId, profile, input.id, startAt, endAt)
  revalidatePath(`/day/${dateKey}`)
}

export async function deleteBlockAction(id: string): Promise<void> {
  const { sb } = await context()
  await deleteBlock(sb, id)
  revalidatePath('/day/[date]', 'page')
}
