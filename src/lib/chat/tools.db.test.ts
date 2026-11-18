import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createTestUser, cleanupTestUsers, type TestUser } from '../../../supabase/tests/helpers'
import { archiveActivity, listActivities } from '@/lib/db/activities'
import { listBlocks, saveBlock } from '@/lib/db/blocks'
import { dayRangeFor } from '@/lib/time/day'
import {
  createActivityTool,
  editBlock,
  getDay,
  logActivity,
  removeBlock,
  setEnd,
  type ToolContext,
} from '@/lib/chat/tools'
import { PALETTE } from '@/lib/chat/palette'
import type { Profile } from '@/lib/types'

const utc: Profile = { timezone: 'UTC', dayStart: '05:00' }
const ny: Profile = { timezone: 'America/New_York', dayStart: '05:00' }
const day = dayRangeFor('2026-08-16', 'UTC', '05:00')

const idOf = (r: unknown) => (r as { block: { id: string } }).block.id

let user: TestUser
const ctx = (now: string, profile: Profile = utc): ToolContext => ({
  sb: user.client,
  userId: user.id,
  profile,
  now: new Date(now),
})
const blocks = () => listBlocks(user.client, day)
const iso = (d: Date) => d.toISOString()

beforeAll(async () => {
  user = await createTestUser('UTC')
})
beforeEach(async () => {
  await user.client.from('blocks').delete().gte('created_at', '1970-01-01')
})
afterAll(cleanupTestUsers)

describe('logActivity', () => {
  test('the first block of the day is logged as an ai actual block with no gap question', async () => {
    const r = await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    expect(r).toMatchObject({ ok: true, block: { activity: 'CS50', kind: 'actual', start: '16:10', end: '16:20' } })
    const rows = await blocks()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'actual', source: 'ai' })
    const early = await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'DP-700', start: '09:00', end: '09:30' })
    expect(early.ok).toBe(true)
  })

  test('a gap before the new start is refused until the user says skip', async () => {
    await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    const refused = await logActivity(ctx('2026-08-16T16:42:00Z'), { activity: 'DP-700', start: '16:40' })
    expect(refused).toMatchObject({
      ok: false,
      error: 'GAP',
      from: '16:20',
      to: '16:40',
      skipWith: { activity: 'DP-700', start: '16:40', gap: 'skip' },
    })
    expect(await blocks()).toHaveLength(1)

    const skipped = await logActivity(ctx('2026-08-16T16:42:00Z'), { activity: 'DP-700', start: '16:40', gap: 'skip' })
    expect(skipped).toMatchObject({ ok: true, block: { start: '16:40', end: '16:50' } })
    const rows = await blocks()
    expect(rows).toHaveLength(2)
    expect(rows.find((b) => iso(b.startAt) === '2026-08-16T16:10:00.000Z')?.endAt.toISOString()).toBe('2026-08-16T16:20:00.000Z')
  })

  test('logging the exact same block again is a no-op, not a duplicate or a trim', async () => {
    const first = await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    const again = await logActivity(ctx('2026-08-16T16:14:00Z'), { activity: 'CS50', start: '16:10' })
    expect(again).toMatchObject({ ok: true, unchanged: true, block: { activity: 'CS50', start: '16:10', end: '16:20' } })
    expect(idOf(again)).toBe(idOf(first))
    expect((await blocks()).map((b) => b.id)).toEqual([idOf(first)])
  })

  test('a block that starts where the last one ended needs no gap answer', async () => {
    await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    const r = await logActivity(ctx('2026-08-16T16:25:00Z'), { activity: 'DP-700', start: '16:20' })
    expect(r.ok).toBe(true)
  })

  test('starting inside the previous block trims it', async () => {
    await logActivity(ctx('2026-08-16T16:42:00Z'), { activity: 'DP-700', start: '16:00', end: '16:40' })
    const r = await logActivity(ctx('2026-08-16T16:55:00Z'), { activity: 'CS50', start: '16:30' })
    expect(r).toMatchObject({ ok: true, block: { start: '16:30', end: '17:00' } })
    const rows = (await blocks()).sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    expect(rows.map((b) => [iso(b.startAt), iso(b.endAt)])).toEqual([
      ['2026-08-16T16:00:00.000Z', '2026-08-16T16:30:00.000Z'],
      ['2026-08-16T16:30:00.000Z', '2026-08-16T17:00:00.000Z'],
    ])
  })

  test('switching inside the current block does not ask about a gap, even with an earlier block', async () => {
    await logActivity(ctx('2026-08-16T09:05:00Z'), { activity: 'AI-101', start: '08:00', end: '08:30' })
    await logActivity(ctx('2026-08-16T09:05:00Z'), { activity: 'CS50', start: '08:30', end: '09:00' })
    const r = await logActivity(ctx('2026-08-16T09:05:00Z'), { activity: 'DP-700', start: '08:50' })
    expect(r).toMatchObject({ ok: true, block: { activity: 'DP-700', start: '08:50', end: '09:10' } })
    const rows = (await blocks()).sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    expect(rows.map((b) => [iso(b.startAt), iso(b.endAt)])).toEqual([
      ['2026-08-16T08:00:00.000Z', '2026-08-16T08:30:00.000Z'],
      ['2026-08-16T08:30:00.000Z', '2026-08-16T08:50:00.000Z'],
      ['2026-08-16T08:50:00.000Z', '2026-08-16T09:10:00.000Z'],
    ])
  })

  test('an unknown activity lists the known names; an ambiguous one is flagged', async () => {
    const missing = await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'Gym', start: '16:10' })
    expect(missing).toMatchObject({ ok: false, error: 'ACTIVITY_NOT_FOUND' })
    expect((missing as unknown as { names: string[] }).names).toContain('CS50')
    const ambiguous = await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'c', start: '16:10' })
    expect(ambiguous).toMatchObject({ ok: false, error: 'ACTIVITY_AMBIGUOUS' })
    expect(await blocks()).toHaveLength(0)
  })

  test.each([
    ['a start in the future', { activity: 'CS50', start: '16:30' }],
    ['an end in the future', { activity: 'CS50', start: '16:00', end: '17:00' }],
    ['an end equal to the start', { activity: 'CS50', start: '16:10', end: '16:10' }],
    ['a past day without an end', { activity: 'CS50', start: '10:00', date: '2026-08-15' }],
    ['a day in the future', { activity: 'CS50', start: '10:00', end: '11:00', date: '2026-08-17' }],
    ['a malformed time', { activity: 'CS50', start: '4:10' }],
    ['a malformed date', { activity: 'CS50', start: '10:00', end: '11:00', date: 'yesterday' }],
  ])('rejects %s and writes nothing', async (_name, args) => {
    const r = await logActivity(ctx('2026-08-16T16:12:00Z'), args)
    expect(r).toMatchObject({ ok: false, error: 'INVALID_TIME' })
    expect(await blocks()).toHaveLength(0)
    expect(await listBlocks(user.client, dayRangeFor('2026-08-15', 'UTC', '05:00'))).toHaveLength(0)
  })

  test('a past day with an explicit end is logged on that day', async () => {
    const r = await logActivity(ctx('2026-08-16T16:12:00Z'), {
      activity: 'CS50',
      start: '10:00',
      end: '11:00',
      date: '2026-08-15',
    })
    expect(r).toMatchObject({ ok: true, block: { start: '10:00', end: '11:00' } })
    const rows = await listBlocks(user.client, dayRangeFor('2026-08-15', 'UTC', '05:00'))
    expect(rows.map((b) => iso(b.startAt))).toEqual(['2026-08-15T10:00:00.000Z'])
  })

  test('after midnight the block belongs to the previous grid day', async () => {
    const r = await logActivity(ctx('2026-08-17T00:42:00Z'), { activity: 'CS50', start: '00:30' })
    expect(r).toMatchObject({ ok: true, block: { start: '00:30', end: '00:50' } })
    const rows = await blocks()
    expect(rows.map((b) => [iso(b.startAt), iso(b.endAt)])).toEqual([
      ['2026-08-17T00:30:00.000Z', '2026-08-17T00:50:00.000Z'],
    ])
    const view = await getDay(ctx('2026-08-17T00:42:00Z'), {})
    expect(view).toMatchObject({ ok: true, date: '2026-08-16', actual: [{ start: '00:30', end: '00:50' }] })
  })

  test('on a spring-forward day the cells line up with the 23-hour grid', async () => {
    const r = await logActivity(ctx('2026-03-08T07:45:00Z', ny), { activity: 'CS50', start: '03:30' })
    expect(r).toMatchObject({ ok: true, block: { start: '03:30', end: '03:50' } })
    const rows = await listBlocks(user.client, dayRangeFor('2026-03-07', 'America/New_York', '05:00'))
    expect(rows.map((b) => [iso(b.startAt), iso(b.endAt)])).toEqual([
      ['2026-03-08T07:30:00.000Z', '2026-03-08T07:50:00.000Z'],
    ])
  })
})

describe('blocks that end at or cross the day boundary', () => {
  const midnightStart: Profile = { timezone: 'UTC', dayStart: '00:00' }
  const wide = { start: new Date('2026-08-16T05:00:00Z'), end: new Date('2026-08-17T10:00:00Z') }
  const spans = async () =>
    (await listBlocks(user.client, wide))
      .filter((b) => b.kind === 'actual')
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map((b) => [iso(b.startAt), iso(b.endAt)])

  test('"22:00 to midnight" works with a 00:00 day start', async () => {
    const r = await logActivity(ctx('2026-08-17T00:30:00Z', midnightStart), {
      activity: 'CS50',
      start: '22:00',
      end: '00:00',
      date: '2026-08-16',
    })
    expect(r).toMatchObject({ ok: true, block: { start: '22:00', end: '00:00' } })
    expect(await spans()).toEqual([['2026-08-16T22:00:00.000Z', '2026-08-17T00:00:00.000Z']])
  })

  test('sleep 23:30 to 06:30 with a 05:00 day start is stored across the boundary and reported as asked', async () => {
    const r = await logActivity(ctx('2026-08-17T07:00:00Z'), {
      activity: 'CS50',
      start: '23:30',
      end: '06:30',
      date: '2026-08-16',
    })
    expect(r).toMatchObject({ ok: true, block: { start: '23:30', end: '06:30' } })
    expect(await spans()).toEqual([
      ['2026-08-16T23:30:00.000Z', '2026-08-17T05:00:00.000Z'],
      ['2026-08-17T05:00:00.000Z', '2026-08-17T06:30:00.000Z'],
    ])
  })

  test('set_end can stretch a block across the day boundary', async () => {
    const sleep = await logActivity(ctx('2026-08-17T07:00:00Z'), {
      activity: 'CS50',
      start: '23:30',
      end: '04:00',
      date: '2026-08-16',
    })
    const r = await setEnd(ctx('2026-08-17T07:00:00Z'), { blockId: idOf(sleep), end: '06:30' })
    expect(r).toMatchObject({ ok: true, block: { start: '23:30', end: '06:30' } })
    expect(await spans()).toEqual([
      ['2026-08-16T23:30:00.000Z', '2026-08-17T05:00:00.000Z'],
      ['2026-08-17T05:00:00.000Z', '2026-08-17T06:30:00.000Z'],
    ])
  })

  test('an end earlier than the start is still rejected, not turned into a 23-hour block', async () => {
    const r = await logActivity(ctx('2026-08-17T07:00:00Z'), {
      activity: 'CS50',
      start: '12:00',
      end: '11:00',
      date: '2026-08-16',
    })
    expect(r).toMatchObject({ ok: false, error: 'INVALID_TIME' })
    expect(await spans()).toEqual([])
  })
})

describe('getDay', () => {
  test('returns actual and plan blocks sorted by start, with activity names and archived flags', async () => {
    const acts = await listActivities(user.client)
    const id = (name: string) => acts.find((a) => a.name === name)!.id
    const at = (s: string) => new Date(`2026-08-16T${s}:00Z`)
    await saveBlock(user.client, user.id, utc, { activityId: id('DP-700'), kind: 'actual', startAt: at('17:00'), endAt: at('17:30'), source: 'manual' })
    await saveBlock(user.client, user.id, utc, { activityId: id('CS50'), kind: 'actual', startAt: at('16:00'), endAt: at('16:30'), source: 'manual' })
    await saveBlock(user.client, user.id, utc, { activityId: id('CS50'), kind: 'plan', startAt: at('16:00'), endAt: at('18:00'), source: 'manual' })
    await archiveActivity(user.client, id('QR SaaS'))

    const r = await getDay(ctx('2026-08-16T18:00:00Z'), {})
    expect(r).toMatchObject({
      ok: true,
      date: '2026-08-16',
      actual: [
        { activity: 'CS50', start: '16:00', end: '16:30', kind: 'actual' },
        { activity: 'DP-700', start: '17:00', end: '17:30', kind: 'actual' },
      ],
      plan: [{ activity: 'CS50', start: '16:00', end: '18:00', kind: 'plan' }],
    })
    const names = (r as unknown as { activities: { name: string; archived: boolean }[] }).activities
    expect(names.find((a) => a.name === 'QR SaaS')?.archived).toBe(true)
    expect(names.find((a) => a.name === 'CS50')?.archived).toBe(false)
  })
})

describe('setEnd', () => {
  test('with no end it extends the latest actual block to now, rounded up, giving it a new id', async () => {
    const first = await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    const r = await setEnd(ctx('2026-08-16T16:42:00Z'), {})
    expect(r).toMatchObject({ ok: true, block: { activity: 'CS50', start: '16:10', end: '16:50' } })
    expect(idOf(r)).not.toBe(idOf(first))
    expect(await blocks()).toHaveLength(1)
  })

  test('an explicit end finishes the block there', async () => {
    await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    const r = await setEnd(ctx('2026-08-16T16:42:00Z'), { end: '16:40' })
    expect(r).toMatchObject({ ok: true, block: { end: '16:40' } })
  })

  test('an end that changes nothing is reported as unchanged', async () => {
    await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    expect(await setEnd(ctx('2026-08-16T16:12:00Z'), {})).toMatchObject({ ok: true, unchanged: true })
  })

  test('rejects an end at the start or in the future, and reports when there is no block', async () => {
    expect(await setEnd(ctx('2026-08-16T16:42:00Z'), {})).toMatchObject({ ok: false, error: 'NO_ACTUAL_BLOCK' })
    await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    expect(await setEnd(ctx('2026-08-16T16:42:00Z'), { end: '16:10' })).toMatchObject({ ok: false, error: 'INVALID_TIME' })
    expect(await setEnd(ctx('2026-08-16T16:42:00Z'), { end: '17:30' })).toMatchObject({ ok: false, error: 'INVALID_TIME' })
  })

  test('extending over the next actual block trims it', async () => {
    const a = await logActivity(ctx('2026-08-16T16:25:00Z'), { activity: 'CS50', start: '16:00', end: '16:20' })
    await logActivity(ctx('2026-08-16T16:55:00Z'), { activity: 'DP-700', start: '16:20', end: '16:50' })
    const r = await setEnd(ctx('2026-08-16T16:55:00Z'), { blockId: idOf(a), end: '16:30' })
    expect(r).toMatchObject({ ok: true, block: { activity: 'CS50', start: '16:00', end: '16:30' } })
    const rows = (await blocks()).sort((x, y) => x.startAt.getTime() - y.startAt.getTime())
    expect(rows.map((b) => [iso(b.startAt), iso(b.endAt)])).toEqual([
      ['2026-08-16T16:00:00.000Z', '2026-08-16T16:30:00.000Z'],
      ['2026-08-16T16:30:00.000Z', '2026-08-16T16:50:00.000Z'],
    ])
  })
})

describe('editBlock and removeBlock', () => {
  test('editBlock changes activity and times in one call', async () => {
    const first = await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    const r = await editBlock(ctx('2026-08-16T16:42:00Z'), { blockId: idOf(first), activity: 'DP-700', start: '16:00', end: '16:30' })
    expect(r).toMatchObject({ ok: true, block: { activity: 'DP-700', start: '16:00', end: '16:30' } })
    const rows = await blocks()
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('ai')
  })

  test('editBlock with nothing to change is a no-op that keeps the id', async () => {
    const first = await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    const r = await editBlock(ctx('2026-08-16T16:42:00Z'), { blockId: idOf(first), start: '16:10', end: '16:20', activity: 'cs50' })
    expect(r).toMatchObject({ ok: true, unchanged: true, block: { activity: 'CS50', start: '16:10', end: '16:20' } })
    expect(idOf(r)).toBe(idOf(first))
    expect((await blocks()).map((b) => b.id)).toEqual([idOf(first)])
  })

  test('editBlock rejects times that are not on the grid or in the future', async () => {
    const first = await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    const r = await editBlock(ctx('2026-08-16T16:42:00Z'), { blockId: idOf(first), end: '18:00' })
    expect(r).toMatchObject({ ok: false, error: 'INVALID_TIME' })
  })

  test('unknown ids are NOT_FOUND', async () => {
    const nobody = '00000000-0000-0000-0000-000000000000'
    expect(await editBlock(ctx('2026-08-16T16:42:00Z'), { blockId: nobody, end: '16:30' })).toMatchObject({ ok: false, error: 'NOT_FOUND' })
    expect(await removeBlock(ctx('2026-08-16T16:42:00Z'), { blockId: nobody })).toMatchObject({ ok: false, error: 'NOT_FOUND' })
  })

  test('removeBlock deletes the block and returns what was deleted', async () => {
    const first = await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    const r = await removeBlock(ctx('2026-08-16T16:42:00Z'), { blockId: idOf(first) })
    expect(r).toMatchObject({ ok: true, deleted: { activity: 'CS50', start: '16:10', end: '16:20' } })
    expect(await blocks()).toHaveLength(0)
  })
})

describe('blocks that must not be touched', () => {
  let other: TestUser
  beforeAll(async () => {
    other = await createTestUser('UTC')
  })
  const otherCtx = (now: string): ToolContext => ({ sb: other.client, userId: other.id, profile: utc, now: new Date(now) })

  test("another user's block id is NOT_FOUND for every tool and the block is untouched", async () => {
    const mine = await logActivity(ctx('2026-08-16T16:12:00Z'), { activity: 'CS50', start: '16:10' })
    const id = idOf(mine)
    const now = '2026-08-16T16:42:00Z'
    expect(await setEnd(otherCtx(now), { blockId: id, end: '16:40' })).toMatchObject({ ok: false, error: 'NOT_FOUND' })
    expect(await editBlock(otherCtx(now), { blockId: id, end: '16:40' })).toMatchObject({ ok: false, error: 'NOT_FOUND' })
    expect(await removeBlock(otherCtx(now), { blockId: id })).toMatchObject({ ok: false, error: 'NOT_FOUND' })
    const rows = await blocks()
    expect(rows.map((b) => [b.id, iso(b.endAt)])).toEqual([[id, '2026-08-16T16:20:00.000Z']])
  })

  test('plan blocks cannot be changed by chat tools', async () => {
    const acts = await listActivities(user.client)
    await saveBlock(user.client, user.id, utc, {
      activityId: acts.find((a) => a.name === 'CS50')!.id,
      kind: 'plan',
      startAt: new Date('2026-08-16T16:00:00Z'),
      endAt: new Date('2026-08-16T17:00:00Z'),
      source: 'manual',
    })
    const [plan] = await blocks()
    const now = '2026-08-16T16:42:00Z'
    expect(await editBlock(ctx(now), { blockId: plan.id, end: '16:30' })).toMatchObject({ ok: false, error: 'NOT_FOUND' })
    expect(await removeBlock(ctx(now), { blockId: plan.id })).toMatchObject({ ok: false, error: 'NOT_FOUND' })
    expect(await blocks()).toHaveLength(1)
  })
})

describe('createActivityTool', () => {
  test('creates an activity with category other and an unused palette colour', async () => {
    const r = await createActivityTool(ctx('2026-08-16T16:12:00Z'), { name: 'Gym' })
    expect(r).toMatchObject({ ok: true, activity: { name: 'Gym', category: 'other' } })
    const gym = (await listActivities(user.client)).find((a) => a.name === 'Gym')!
    expect(PALETTE.map((c) => c.toLowerCase())).toContain(gym.color.toLowerCase())
    expect(gym.colorTo).toBeNull()
  })

  test('stores a given category and gives the next activity a different colour', async () => {
    await createActivityTool(ctx('2026-08-16T16:12:00Z'), { name: 'Run', category: 'exercise' })
    const acts = await listActivities(user.client)
    const run = acts.find((a) => a.name === 'Run')!
    expect(run.category).toBe('exercise')
    expect(run.color.toLowerCase()).not.toBe(acts.find((a) => a.name === 'Gym')!.color.toLowerCase())
  })

  test('a duplicate name is EXISTS and a blank name is INVALID_NAME', async () => {
    expect(await createActivityTool(ctx('2026-08-16T16:12:00Z'), { name: 'gym' })).toMatchObject({ ok: false, error: 'EXISTS' })
    expect(await createActivityTool(ctx('2026-08-16T16:12:00Z'), { name: '   ' })).toMatchObject({ ok: false, error: 'INVALID_NAME' })
  })
})
