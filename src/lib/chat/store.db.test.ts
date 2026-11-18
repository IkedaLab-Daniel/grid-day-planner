import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, cleanupTestUsers, type TestUser } from '../../../supabase/tests/helpers'
import { countUserMessagesSince, loadHistory, saveTurn } from '@/lib/chat/store'

let user: TestUser
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeAll(async () => {
  user = await createTestUser()
})
afterAll(cleanupTestUsers)

describe('chat store', () => {
  test('saveTurn then loadHistory returns the user message before the assistant reply', async () => {
    await saveTurn(user.client, user.id, {
      user: 'I started CS50',
      assistant: 'Logged CS50',
      toolCalls: [{ name: 'log_activity', args: { activity: 'CS50' }, result: { ok: true } }],
      startedAt: new Date(),
    })
    const h = await loadHistory(user.client)
    expect(h.map((m) => [m.role, m.content])).toEqual([
      ['user', 'I started CS50'],
      ['assistant', 'Logged CS50'],
    ])
    expect(h[0].createdAt).toBeInstanceOf(Date)
  })

  test('the tool calls are stored on the assistant row', async () => {
    const { data } = await user.client.from('chat_messages').select('role, tool_calls').eq('role', 'assistant')
    expect(data?.[0].tool_calls).toEqual([{ name: 'log_activity', args: { activity: 'CS50' }, result: { ok: true } }])
  })

  test('loadHistory returns only the latest messages, oldest first', async () => {
    for (let i = 2; i <= 3; i++) {
      await sleep(5)
      await saveTurn(user.client, user.id, { user: `u${i}`, assistant: `a${i}`, toolCalls: [], startedAt: new Date() })
    }
    const h = await loadHistory(user.client, 2)
    expect(h.map((m) => m.content)).toEqual(['u3', 'a3'])
  })

  test('countUserMessagesSince counts only user rows after the cutoff', async () => {
    const cutoff = new Date(Date.now() - 3600_000)
    const before = await countUserMessagesSince(user.client, cutoff)
    await saveTurn(user.client, user.id, {
      user: 'old one',
      assistant: 'ok',
      toolCalls: [],
      startedAt: new Date(Date.now() - 2 * 3600_000),
    })
    expect(await countUserMessagesSince(user.client, cutoff)).toBe(before)
    await saveTurn(user.client, user.id, { user: 'new one', assistant: 'ok', toolCalls: [], startedAt: new Date() })
    expect(await countUserMessagesSince(user.client, cutoff)).toBe(before + 1)
  })
})
