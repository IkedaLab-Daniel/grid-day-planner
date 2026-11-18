import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { AIMessage } from '@langchain/core/messages'
import { admin, createTestUser, cleanupTestUsers, type TestUser } from '../../../supabase/tests/helpers'
import { listBlocks } from '@/lib/db/blocks'
import { dayRangeFor } from '@/lib/time/day'
import { ChatError, HISTORY_LIMIT, MAX_MESSAGE_LENGTH, RATE_LIMIT_PER_HOUR, getHistory, sendMessage } from '@/lib/chat/service'
import { scriptedModel } from '@/lib/chat/testing'

let user: TestUser
const NOW = new Date('2026-08-16T16:12:00Z')
const deps = (model: ReturnType<typeof scriptedModel>) => ({ sb: user.client, userId: user.id, model, now: NOW })
const rows = async () => (await admin.from('chat_messages').select('role, content, tool_calls').eq('user_id', user.id).order('created_at')).data ?? []
const call = (name: string, args: Record<string, unknown>) =>
  new AIMessage({ content: '', tool_calls: [{ id: 'call_1', name, args, type: 'tool_call' }] })

beforeAll(async () => {
  user = await createTestUser('UTC')
})
beforeEach(async () => {
  await admin.from('chat_messages').delete().eq('user_id', user.id)
  await admin.from('blocks').delete().eq('user_id', user.id)
})
afterAll(cleanupTestUsers)

describe('sendMessage', () => {
  test('a successful turn stores both messages with the tool calls and returns the reply', async () => {
    const model = scriptedModel([call('log_activity', { activity: 'CS50', start: '16:10' }), new AIMessage('Logged CS50 16:10-16:20')])
    const r = await sendMessage(deps(model), '  I started CS50 at 4:10  ')
    expect(r).toEqual({ reply: 'Logged CS50 16:10-16:20', changed: true })
    const stored = await rows()
    expect(stored.map((m) => [m.role, m.content])).toEqual([
      ['user', 'I started CS50 at 4:10'],
      ['assistant', 'Logged CS50 16:10-16:20'],
    ])
    expect(stored[1].tool_calls).toMatchObject([{ name: 'log_activity', result: { ok: true } }])
    const blocks = await listBlocks(user.client, dayRangeFor('2026-08-16', 'UTC', '05:00'))
    expect(blocks).toHaveLength(1)
    expect(blocks[0].source).toBe('ai')
  })

  test('a model failure is a 503 and nothing is stored', async () => {
    const failing = scriptedModel([])
    await expect(sendMessage(deps(failing), 'hello')).rejects.toMatchObject({ name: 'ChatError', status: 503 })
    expect(await rows()).toHaveLength(0)
  })

  test('empty, whitespace and over-long messages are 400 and never reach the model', async () => {
    const model = scriptedModel([new AIMessage('x')])
    for (const bad of ['', '   ', 'a'.repeat(MAX_MESSAGE_LENGTH + 1)]) {
      await expect(sendMessage(deps(model), bad)).rejects.toMatchObject({ status: 400 })
    }
    expect(model.calls).toHaveLength(0)
    expect(MAX_MESSAGE_LENGTH).toBe(1000)
  })

  test('the 31st user message within an hour is 429, but messages older than an hour do not count', async () => {
    const old = Array.from({ length: RATE_LIMIT_PER_HOUR }, (_, i) => ({
      user_id: user.id,
      role: 'user',
      content: `old ${i}`,
      created_at: new Date(Date.now() - 2 * 3600_000 + i * 1000).toISOString(),
    }))
    await admin.from('chat_messages').insert(old)
    const ok = await sendMessage(deps(scriptedModel([new AIMessage('fine')])), 'hello')
    expect(ok.reply).toBe('fine')

    await admin.from('chat_messages').delete().eq('user_id', user.id)
    const recent = Array.from({ length: RATE_LIMIT_PER_HOUR }, (_, i) => ({
      user_id: user.id,
      role: 'user',
      content: `recent ${i}`,
      created_at: new Date(Date.now() - 60_000 + i).toISOString(),
    }))
    await admin.from('chat_messages').insert(recent)
    const model = scriptedModel([new AIMessage('never')])
    await expect(sendMessage(deps(model), 'one more')).rejects.toMatchObject({ status: 429 })
    expect(model.calls).toHaveLength(0)
  })

  test('only the last 20 messages are replayed to the model', async () => {
    const seeded = Array.from({ length: 25 }, (_, i) => ({
      user_id: user.id,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
      created_at: new Date(Date.now() - 600_000 + i * 1000).toISOString(),
    }))
    await admin.from('chat_messages').insert(seeded)
    const model = scriptedModel([new AIMessage('ok')])
    await sendMessage(deps(model), 'new message')
    expect(HISTORY_LIMIT).toBe(20)
    expect(model.calls[0]).toHaveLength(1 + 20 + 1)
    expect(String(model.calls[0][1].content)).toBe('m5')
  })

  test('ChatError carries its status', () => {
    expect(new ChatError(429, 'slow down').status).toBe(429)
  })
})

describe('getHistory', () => {
  test('returns the stored messages oldest first', async () => {
    await sendMessage(deps(scriptedModel([new AIMessage('hi there')])), 'hello')
    const h = await getHistory(user.client)
    expect(h.map((m) => m.content)).toEqual(['hello', 'hi there'])
  })
})
