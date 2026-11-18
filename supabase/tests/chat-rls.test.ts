import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, cleanupTestUsers, type TestUser } from './helpers'

let a: TestUser
let b: TestUser
let rowId: string

beforeAll(async () => {
  a = await createTestUser()
  b = await createTestUser()
  const ins = await a.client
    .from('chat_messages')
    .insert({ user_id: a.id, role: 'user', content: 'hello' })
    .select('id')
    .single()
  if (ins.error) throw ins.error
  rowId = ins.data.id
})
afterAll(cleanupTestUsers)

describe('chat_messages row level security', () => {
  test('a user reads their own rows', async () => {
    const { data } = await a.client.from('chat_messages').select('content').eq('id', rowId)
    expect(data).toEqual([{ content: 'hello' }])
  })

  test("another user cannot read the rows", async () => {
    const { data } = await b.client.from('chat_messages').select('*').eq('user_id', a.id)
    expect(data).toEqual([])
  })

  test('another user cannot insert rows as someone else', async () => {
    const { error } = await b.client.from('chat_messages').insert({ user_id: a.id, role: 'user', content: 'x' })
    expect(error).not.toBeNull()
  })

  test('users cannot update or delete even their own rows', async () => {
    const upd = await a.client.from('chat_messages').update({ content: 'changed' }).eq('id', rowId).select()
    expect(upd.data).toEqual([])
    const del = await a.client.from('chat_messages').delete().eq('id', rowId).select()
    expect(del.data).toEqual([])
    const still = await a.client.from('chat_messages').select('content').eq('id', rowId)
    expect(still.data).toEqual([{ content: 'hello' }])
  })

  test('role must be user or assistant', async () => {
    const { error } = await a.client.from('chat_messages').insert({ user_id: a.id, role: 'system', content: 'x' })
    expect(error).not.toBeNull()
  })
})
