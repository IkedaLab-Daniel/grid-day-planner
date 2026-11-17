import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, cleanupTestUsers, type TestUser } from '../../../supabase/tests/helpers'
import { listBlocks, saveBlock, moveBlock } from '@/lib/db/blocks'
import { listActivities } from '@/lib/db/activities'
import { getProfile } from '@/lib/db/profile'
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
