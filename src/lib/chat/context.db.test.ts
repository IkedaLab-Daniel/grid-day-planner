import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, cleanupTestUsers, type TestUser } from '../../../supabase/tests/helpers'
import { archiveActivity, listActivities } from '@/lib/db/activities'
import { saveBlock } from '@/lib/db/blocks'
import { loadDayContext } from '@/lib/chat/context'
import { logActivity, type ToolContext } from '@/lib/chat/tools'

let user: TestUser
let ctx: ToolContext

beforeAll(async () => {
  user = await createTestUser('UTC')
  ctx = { sb: user.client, userId: user.id, profile: { timezone: 'UTC', dayStart: '05:00' }, now: new Date('2026-08-16T16:12:00Z') }
})
afterAll(cleanupTestUsers)

describe('loadDayContext', () => {
  test("returns today's actual and plan blocks and only the live activities", async () => {
    const acts = await listActivities(user.client)
    await logActivity(ctx, { activity: 'CS50', start: '16:10' })
    await saveBlock(user.client, user.id, ctx.profile, {
      activityId: acts.find((a) => a.name === 'DP-700')!.id,
      kind: 'plan',
      startAt: new Date('2026-08-16T16:00:00Z'),
      endAt: new Date('2026-08-16T18:00:00Z'),
      source: 'manual',
    })
    await archiveActivity(user.client, acts.find((a) => a.name === 'QR SaaS')!.id)

    const c = await loadDayContext(ctx)
    expect(c.dayKey).toBe('2026-08-16')
    expect(c.actual).toMatchObject([{ activity: 'CS50', start: '16:10', end: '16:20' }])
    expect(c.plan).toMatchObject([{ activity: 'DP-700', start: '16:00', end: '18:00' }])
    const names = c.activities.map((a) => a.name)
    expect(names).toContain('CS50')
    expect(names).not.toContain('QR SaaS')
  })
})
