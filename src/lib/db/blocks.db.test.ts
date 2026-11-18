import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, cleanupTestUsers, type TestUser } from '../../../supabase/tests/helpers'
import { getBlock, listBlocks, saveBlock, moveBlock } from '@/lib/db/blocks'
import { listActivities } from '@/lib/db/activities'
import { getProfile, updateProfile } from '@/lib/db/profile'
import { dayRangeFor } from '@/lib/time/day'
import type { NewBlock, Profile } from '@/lib/types'

let user: TestUser
let profile: Profile
let actA: string
let actB: string

const day = dayRangeFor('2026-08-16', 'UTC', '05:00')
const t = (s: string) => new Date(`2026-08-16T${s}:00Z`)
const mk = (activityId: string, from: string, to: string, kind: 'plan' | 'actual' = 'plan'): NewBlock => ({
  activityId,
  kind,
  startAt: t(from),
  endAt: t(to),
  source: 'manual',
})

beforeAll(async () => {
  user = await createTestUser('UTC')
  profile = await getProfile(user.client)
  const acts = await listActivities(user.client)
  actA = acts[0].id
  actB = acts[1].id
})
afterAll(cleanupTestUsers)

describe('profile and activities', () => {
  test('getProfile returns timezone and HH:mm day start', () => {
    expect(profile).toEqual({ timezone: 'UTC', dayStart: '05:00' })
  })
  test('listActivities returns the six seeds', async () => {
    expect(await listActivities(user.client)).toHaveLength(6)
  })
})

describe('saveBlock / listBlocks', () => {
  test('painting over part of an existing block persists the trimmed block and the new one', async () => {
    await saveBlock(user.client, user.id, profile, mk(actA, '09:00', '11:00'))
    await saveBlock(user.client, user.id, profile, mk(actB, '10:00', '12:00'))
    const rows = (await listBlocks(user.client, day)).sort((x, y) => x.startAt.getTime() - y.startAt.getTime())
    expect(rows.map((r) => [r.activityId, r.startAt.toISOString(), r.endAt.toISOString()])).toEqual([
      [actA, '2026-08-16T09:00:00.000Z', '2026-08-16T10:00:00.000Z'],
      [actB, '2026-08-16T10:00:00.000Z', '2026-08-16T12:00:00.000Z'],
    ])
  })

  test('a block crossing the day boundary is stored as two rows', async () => {
    await saveBlock(user.client, user.id, profile, {
      ...mk(actA, '00:00', '00:00', 'actual'),
      startAt: new Date('2026-08-17T04:50:00Z'),
      endAt: new Date('2026-08-17T05:20:00Z'),
    })
    const nextDay = dayRangeFor('2026-08-17', 'UTC', '05:00')
    const prev = (await listBlocks(user.client, day)).filter((b) => b.kind === 'actual')
    const next = (await listBlocks(user.client, nextDay)).filter((b) => b.kind === 'actual')
    expect(prev.map((b) => b.endAt.toISOString())).toEqual(['2026-08-17T05:00:00.000Z'])
    expect(next.map((b) => b.startAt.toISOString())).toEqual(['2026-08-17T05:00:00.000Z'])
  })

  test('listBlocks excludes blocks entirely outside the range', async () => {
    await saveBlock(user.client, user.id, profile, {
      ...mk(actA, '00:00', '00:00'),
      startAt: new Date('2026-08-20T09:00:00Z'),
      endAt: new Date('2026-08-20T10:00:00Z'),
    })
    const rows = await listBlocks(user.client, day)
    expect(rows.some((b) => b.startAt.toISOString().startsWith('2026-08-20'))).toBe(false)
  })
})

describe('moveBlock', () => {
  test('editing a block over a neighbour trims the neighbour and keeps one copy of itself', async () => {
    const before = (await listBlocks(user.client, day)).filter((b) => b.kind === 'plan')
    const first = before.find((b) => b.activityId === actA)! // 09:00-10:00
    await moveBlock(user.client, user.id, profile, first.id, t('09:30'), t('10:30'))
    const after = (await listBlocks(user.client, day))
      .filter((b) => b.kind === 'plan')
      .sort((x, y) => x.startAt.getTime() - y.startAt.getTime())
    expect(after.map((r) => [r.activityId, r.startAt.toISOString(), r.endAt.toISOString()])).toEqual([
      [actA, '2026-08-16T09:30:00.000Z', '2026-08-16T10:30:00.000Z'],
      [actB, '2026-08-16T10:30:00.000Z', '2026-08-16T12:00:00.000Z'],
    ])
  })
})

describe('moveBlock on a block that crosses the current day boundary', () => {
  test('keeps the part of the original that belongs to the neighbouring day', async () => {
    const u = await createTestUser('UTC')
    const acts = await listActivities(u.client)
    // Stored while the day started at 05:00; it later crosses the new 06:00 boundary.
    const ins = await u.client
      .from('blocks')
      .insert({
        user_id: u.id,
        activity_id: acts[0].id,
        kind: 'plan',
        start_at: '2026-11-10T05:00:00Z',
        end_at: '2026-11-10T07:00:00Z',
      })
      .select('id')
      .single()
    expect(ins.error).toBeNull()
    await updateProfile(u.client, u.id, { timezone: 'UTC', dayStart: '06:00' })
    const p = await getProfile(u.client)

    await moveBlock(u.client, u.id, p, ins.data!.id, new Date('2026-11-10T06:00:00Z'), new Date('2026-11-10T07:30:00Z'))

    const rows = (
      await listBlocks(u.client, { start: new Date('2026-11-09T06:00:00Z'), end: new Date('2026-11-11T06:00:00Z') })
    ).sort((x, y) => x.startAt.getTime() - y.startAt.getTime())
    expect(rows.map((r) => [r.startAt.toISOString(), r.endAt.toISOString()])).toEqual([
      ['2026-11-10T05:00:00.000Z', '2026-11-10T06:00:00.000Z'],
      ['2026-11-10T06:00:00.000Z', '2026-11-10T07:30:00.000Z'],
    ])
  })
})

describe('getBlock and moveBlock with an activity', () => {
  const d = (t: string) => new Date(`2026-09-01T${t}:00Z`)
  const range = dayRangeFor('2026-09-01', 'UTC', '05:00')

  test('getBlock returns a block by id and null for an unknown id', async () => {
    await saveBlock(user.client, user.id, profile, { activityId: actA, kind: 'plan', startAt: d('09:00'), endAt: d('10:00'), source: 'manual' })
    const [b] = await listBlocks(user.client, range)
    expect(await getBlock(user.client, b.id)).toMatchObject({ id: b.id, activityId: actA, kind: 'plan' })
    expect(await getBlock(user.client, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  test('moveBlock with an activityId swaps the activity and keeps the times', async () => {
    const [b] = await listBlocks(user.client, range)
    await moveBlock(user.client, user.id, profile, b.id, d('09:00'), d('10:00'), actB)
    const rows = await listBlocks(user.client, range)
    expect(rows.map((r) => [r.activityId, r.startAt.toISOString(), r.endAt.toISOString()])).toEqual([
      [actB, '2026-09-01T09:00:00.000Z', '2026-09-01T10:00:00.000Z'],
    ])
  })
})
