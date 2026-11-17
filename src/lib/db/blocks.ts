import type { SupabaseClient } from '@supabase/supabase-js'
import { paintBlocks } from '@/lib/blocks/paint'
import { splitAtDayBoundaries } from '@/lib/blocks/boundary'
import { dateKeyOf, dayRangeFor } from '@/lib/time/day'
import type { Block, DayRange, NewBlock, Profile } from '@/lib/types'

interface BlockRow {
  id: string
  activity_id: string
  kind: Block['kind']
  start_at: string
  end_at: string
  source: Block['source']
}

function toBlock(r: BlockRow): Block {
  return {
    id: r.id,
    activityId: r.activity_id,
    kind: r.kind,
    startAt: new Date(r.start_at),
    endAt: new Date(r.end_at),
    source: r.source,
  }
}

export async function listBlocks(sb: SupabaseClient, range: DayRange): Promise<Block[]> {
  const { data, error } = await sb
    .from('blocks')
    .select('id, activity_id, kind, start_at, end_at, source')
    .lt('start_at', range.end.toISOString())
    .gt('end_at', range.start.toISOString())
  if (error) throw error
  return (data as BlockRow[]).map(toBlock)
}

export async function deleteBlock(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('blocks').delete().eq('id', id)
  if (error) throw error
}

/**
 * Persist a painted block: split at day boundaries, then replace overlapped same-kind
 * blocks in each day. `replacingId` is ignored while painting and deleted afterwards
 * (used when editing a block). Writes are sequential, not one transaction.
 */
export async function saveBlock(
  sb: SupabaseClient,
  userId: string,
  profile: Profile,
  block: NewBlock,
  replacingId?: string,
): Promise<void> {
  for (const piece of splitAtDayBoundaries(block, profile.timezone, profile.dayStart)) {
    const range = dayRangeFor(dateKeyOf(piece.startAt, profile.timezone, profile.dayStart), profile.timezone, profile.dayStart)
    const existing = (await listBlocks(sb, range)).filter((b) => b.id !== replacingId)
    const result = paintBlocks(existing, piece)

    if (result.deleteIds.length) {
      const { error } = await sb.from('blocks').delete().in('id', result.deleteIds)
      if (error) throw error
    }
    for (const u of result.updates) {
      const { error } = await sb
        .from('blocks')
        .update({ start_at: u.startAt.toISOString(), end_at: u.endAt.toISOString() })
        .eq('id', u.id)
      if (error) throw error
    }
    const { error } = await sb.from('blocks').insert(
      result.inserts.map((n) => ({
        user_id: userId,
        activity_id: n.activityId,
        kind: n.kind,
        start_at: n.startAt.toISOString(),
        end_at: n.endAt.toISOString(),
        source: n.source,
      })),
    )
    if (error) throw error
  }
  if (replacingId) await deleteBlock(sb, replacingId)
}

/** Change a block's times: the edited block replaces overlapped neighbours, then the original goes. */
export async function moveBlock(
  sb: SupabaseClient,
  userId: string,
  profile: Profile,
  id: string,
  startAt: Date,
  endAt: Date,
): Promise<void> {
  const { data, error } = await sb
    .from('blocks')
    .select('id, activity_id, kind, start_at, end_at, source')
    .eq('id', id)
    .single()
  if (error) throw error
  const original = toBlock(data as BlockRow)
  await saveBlock(
    sb,
    userId,
    profile,
    { activityId: original.activityId, kind: original.kind, source: original.source, startAt, endAt },
    id,
  )
}
