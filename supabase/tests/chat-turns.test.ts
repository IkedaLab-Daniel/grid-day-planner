import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { admin, createTestUser, cleanupTestUsers, type TestUser } from './helpers'

let a: TestUser
let b: TestUser

const begin = (u: TestUser, max = 30) => u.client.rpc('chat_begin_turn', { max_per_hour: max })
const end = (u: TestUser, id: string) => u.client.rpc('chat_end_turn', { turn_id: id })

beforeAll(async () => {
  a = await createTestUser()
  b = await createTestUser()
})
afterAll(cleanupTestUsers)

describe('chat_begin_turn / chat_end_turn', () => {
  test('a turn blocks the next one until it ends', async () => {
    const first = await begin(a)
    expect(first.data).toMatchObject({ status: 'ok' })
    expect(first.data.id).toBeTruthy()
    expect((await begin(a)).data).toEqual({ status: 'busy' })
    await end(a, first.data.id)
    expect((await begin(a)).data).toMatchObject({ status: 'ok' })
  })

  test("another user's turn neither blocks nor counts", async () => {
    const mine = await begin(b)
    expect(mine.data).toMatchObject({ status: 'ok' })
    await end(b, mine.data.id)
  })

  test('concurrent begins: exactly one wins', async () => {
    const u = await createTestUser()
    const results = await Promise.all(Array.from({ length: 6 }, () => begin(u)))
    const statuses = results.map((r) => r.data.status).sort()
    expect(statuses).toEqual(['busy', 'busy', 'busy', 'busy', 'busy', 'ok'])
  })

  test('attempts count even when finished; the limit applies per rolling hour', async () => {
    const u = await createTestUser()
    for (let i = 0; i < 3; i++) {
      const t = await begin(u, 3)
      expect(t.data).toMatchObject({ status: 'ok' })
      await end(u, t.data.id)
    }
    expect((await begin(u, 3)).data).toEqual({ status: 'rate_limited' })

    const old = await createTestUser()
    await admin.from('chat_turns').insert(
      Array.from({ length: 3 }, (_, i) => ({
        user_id: old.id,
        started_at: new Date(Date.now() - 2 * 3600_000 + i * 1000).toISOString(),
        finished_at: new Date(Date.now() - 2 * 3600_000 + i * 1000 + 500).toISOString(),
      })),
    )
    expect((await begin(old, 3)).data).toMatchObject({ status: 'ok' })
  })

  test('a turn left unfinished for over two minutes stops blocking', async () => {
    const u = await createTestUser()
    await admin.from('chat_turns').insert({ user_id: u.id, started_at: new Date(Date.now() - 3 * 60_000).toISOString() })
    expect((await begin(u)).data).toMatchObject({ status: 'ok' })
  })

  test('signed-out callers cannot use the functions', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    })
    expect((await anon.rpc('chat_begin_turn', { max_per_hour: 30 })).error).not.toBeNull()
  })
})

describe('chat_turns table', () => {
  test('users can read their own turns but cannot write, change or delete them directly', async () => {
    const own = await a.client.from('chat_turns').select('id')
    expect((own.data ?? []).length).toBeGreaterThan(0)
    expect((await b.client.from('chat_turns').select('id').eq('user_id', a.id)).data).toEqual([])
    expect((await a.client.from('chat_turns').insert({ user_id: a.id })).error).not.toBeNull()
    expect((await a.client.from('chat_turns').update({ finished_at: new Date().toISOString() }).eq('user_id', a.id).select()).data).toEqual([])
    expect((await a.client.from('chat_turns').delete().eq('user_id', a.id).select()).data).toEqual([])
  })
})
