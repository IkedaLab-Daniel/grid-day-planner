import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, cleanupTestUsers, type TestUser } from './helpers'

const SEED_NAMES = ['AI-101', 'DP-700', 'CS50', 'QR SaaS', 'Capstone', 'IOT commission']

let a: TestUser
let b: TestUser
let aActivityId: string
let aBlockId: string

const hour = (h: number) => new Date(Date.UTC(2026, 7, 16, h)).toISOString()

beforeAll(async () => {
  a = await createTestUser('Asia/Tokyo')
  b = await createTestUser()
  const acts = await a.client.from('activities').select('id').limit(1).single()
  aActivityId = acts.data!.id
  const blk = await a.client
    .from('blocks')
    .insert({ user_id: a.id, activity_id: aActivityId, kind: 'plan', start_at: hour(9), end_at: hour(10) })
    .select('id')
    .single()
  if (blk.error) throw blk.error
  aBlockId = blk.data.id
})

afterAll(cleanupTestUsers)

describe('new user seeding', () => {
  test('profile takes timezone from sign-up metadata', async () => {
    const { data } = await a.client.from('profiles').select('timezone, day_start').single()
    expect(data?.timezone).toBe('Asia/Tokyo')
    expect(data?.day_start).toMatch(/^05:00/)
  })

  test('exactly the six seed activities exist', async () => {
    const { data } = await a.client.from('activities').select('name, category, color_to')
    expect(data?.map((r) => r.name).sort()).toEqual([...SEED_NAMES].sort())
    expect(data?.every((r) => r.category === 'study')).toBe(true)
    expect(data?.find((r) => r.name === 'Capstone')?.color_to).toBeTruthy()
  })
})

describe('row level security', () => {
  test("B cannot read A's rows", async () => {
    for (const table of ['blocks', 'activities', 'profiles'] as const) {
      const { data } = await b.client.from(table).select('*').eq(table === 'profiles' ? 'id' : 'user_id', a.id)
      expect(data).toEqual([])
    }
  })

  test("B cannot insert a block as user A", async () => {
    const { error } = await b.client
      .from('blocks')
      .insert({ user_id: a.id, activity_id: aActivityId, kind: 'plan', start_at: hour(1), end_at: hour(2) })
    expect(error).not.toBeNull()
  })

  test("B cannot update or delete A's block", async () => {
    const upd = await b.client.from('blocks').update({ kind: 'actual' }).eq('id', aBlockId).select()
    expect(upd.data).toEqual([])
    const del = await b.client.from('blocks').delete().eq('id', aBlockId).select()
    expect(del.data).toEqual([])
    const still = await a.client.from('blocks').select('id').eq('id', aBlockId)
    expect(still.data).toHaveLength(1)
  })

  test("B cannot attach their own block to A's activity", async () => {
    const { error } = await b.client
      .from('blocks')
      .insert({ user_id: b.id, activity_id: aActivityId, kind: 'plan', start_at: hour(1), end_at: hour(2) })
    expect(error).not.toBeNull()
  })

  test('end_at must be after start_at', async () => {
    const { error } = await a.client
      .from('blocks')
      .insert({ user_id: a.id, activity_id: aActivityId, kind: 'plan', start_at: hour(5), end_at: hour(5) })
    expect(error).not.toBeNull()
  })
})
