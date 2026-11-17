import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, cleanupTestUsers, type TestUser } from '../../../supabase/tests/helpers'
import { archiveActivity, createActivity, listActivities, updateActivity } from '@/lib/db/activities'
import { getProfile, updateProfile } from '@/lib/db/profile'
import { listBlocks, saveBlock } from '@/lib/db/blocks'
import { dayRangeFor } from '@/lib/time/day'

let user: TestUser
beforeAll(async () => {
  user = await createTestUser('UTC')
})
afterAll(cleanupTestUsers)

describe('activities', () => {
  test('createActivity adds an activity of the given category', async () => {
    await createActivity(user.client, user.id, { name: 'Run', color: '#112233', colorTo: null, category: 'exercise' })
    const run = (await listActivities(user.client)).find((a) => a.name === 'Run')
    expect(run).toMatchObject({ color: '#112233', colorTo: null, category: 'exercise', archivedAt: null })
  })

  test('updateActivity changes name, colours and category', async () => {
    const run = (await listActivities(user.client)).find((a) => a.name === 'Run')!
    await updateActivity(user.client, run.id, { name: 'Jog', color: '#445566', colorTo: '#778899', category: 'other' })
    const jog = (await listActivities(user.client)).find((a) => a.id === run.id)
    expect(jog).toMatchObject({ name: 'Jog', color: '#445566', colorTo: '#778899', category: 'other' })
  })

  test('archiveActivity keeps the activity and its blocks', async () => {
    const jog = (await listActivities(user.client)).find((a) => a.name === 'Jog')!
    const profile = await getProfile(user.client)
    await saveBlock(user.client, user.id, profile, {
      activityId: jog.id,
      kind: 'actual',
      startAt: new Date('2026-08-16T09:00:00Z'),
      endAt: new Date('2026-08-16T10:00:00Z'),
      source: 'manual',
    })
    await archiveActivity(user.client, jog.id)
    const after = (await listActivities(user.client)).find((a) => a.id === jog.id)
    expect(after?.archivedAt).toBeInstanceOf(Date)
    expect(await listBlocks(user.client, dayRangeFor('2026-08-16', 'UTC', '05:00'))).toHaveLength(1)
  })
})

describe('updateProfile', () => {
  test('persists timezone and day start', async () => {
    await updateProfile(user.client, user.id, { timezone: 'Asia/Tokyo', dayStart: '06:30' })
    expect(await getProfile(user.client)).toEqual({ timezone: 'Asia/Tokyo', dayStart: '06:30' })
  })
})
