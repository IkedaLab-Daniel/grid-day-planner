import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createTestUser, cleanupTestUsers, type TestUser } from '../../../supabase/tests/helpers'
import { archiveActivity, listActivities } from '@/lib/db/activities'
import { listBlocks, saveBlock } from '@/lib/db/blocks'
import { dayRangeFor } from '@/lib/time/day'
import { getDay, logActivity, type ToolContext } from '@/lib/chat/tools'
import type { Profile } from '@/lib/types'

const utc: Profile = { timezone: 'UTC', dayStart: '05:00' }
const ny: Profile = { timezone: 'America/New_York', dayStart: '05:00' }
const day = dayRangeFor('2026-08-16', 'UTC', '05:00')

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
    expect(refused).toMatchObject({ ok: false, error: 'GAP', from: '16:20', to: '16:40' })
    expect(await blocks()).toHaveLength(1)

    const skipped = await logActivity(ctx('2026-08-16T16:42:00Z'), { activity: 'DP-700', start: '16:40', gap: 'skip' })
    expect(skipped).toMatchObject({ ok: true, block: { start: '16:40', end: '16:50' } })
    const rows = await blocks()
    expect(rows).toHaveLength(2)
    expect(rows.find((b) => iso(b.startAt) === '2026-08-16T16:10:00.000Z')?.endAt.toISOString()).toBe('2026-08-16T16:20:00.000Z')
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
