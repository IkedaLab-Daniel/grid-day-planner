import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createTestUser, cleanupTestUsers, type TestUser } from '../../../supabase/tests/helpers'
import { listBlocks } from '@/lib/db/blocks'
import { dayRangeFor } from '@/lib/time/day'
import { MAX_TOOL_ITERATIONS, runChatTurn } from '@/lib/chat/graph'
import { scriptedModel } from '@/lib/chat/testing'
import type { ToolContext } from '@/lib/chat/tools'

let user: TestUser
let ctx: ToolContext
const day = dayRangeFor('2026-08-16', 'UTC', '05:00')

const call = (name: string, args: Record<string, unknown>, id = 'call_1') =>
  new AIMessage({ content: '', tool_calls: [{ id, name, args, type: 'tool_call' }] })

beforeAll(async () => {
  user = await createTestUser('UTC')
  ctx = { sb: user.client, userId: user.id, profile: { timezone: 'UTC', dayStart: '05:00' }, now: new Date('2026-08-16T16:12:00Z') }
})
beforeEach(async () => {
  await user.client.from('blocks').delete().gte('created_at', '1970-01-01')
})
afterAll(cleanupTestUsers)

const run = (model: ReturnType<typeof scriptedModel>, message = 'I started CS50 at 4:10', history: { role: 'user' | 'assistant'; content: string }[] = []) =>
  runChatTurn({ model, ctx, history, message })

describe('runChatTurn', () => {
  test('a tool call then a final message logs the block and returns the reply', async () => {
    const model = scriptedModel([
      call('log_activity', { activity: 'CS50', start: '16:10' }),
      new AIMessage('Logged CS50 16:10-16:20'),
    ])
    const r = await run(model)
    expect(r.reply).toBe('Logged CS50 16:10-16:20')
    expect(r.changed).toBe(true)
    expect(r.toolCalls).toHaveLength(1)
    expect(r.toolCalls[0]).toMatchObject({ name: 'log_activity', args: { activity: 'CS50', start: '16:10' }, result: { ok: true } })
    const rows = await listBlocks(user.client, day)
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('ai')
  })

  test('a read-only turn does not report a change', async () => {
    const r = await run(scriptedModel([call('get_day', {}), new AIMessage('Nothing logged yet')]))
    expect(r.changed).toBe(false)
    expect(r.reply).toBe('Nothing logged yet')
  })

  test('a failed tool result is fed back to the model and nothing is written', async () => {
    const r = await run(
      scriptedModel([call('log_activity', { activity: 'Gym', start: '16:10' }), new AIMessage('I do not know Gym. Create it?')]),
    )
    expect(r.toolCalls[0].result).toMatchObject({ ok: false, error: 'ACTIVITY_NOT_FOUND' })
    expect(r.changed).toBe(false)
    expect(r.reply).toBe('I do not know Gym. Create it?')
    expect(await listBlocks(user.client, day)).toHaveLength(0)
  })

  test('invalid tool arguments become a TOOL_FAILED result, not a crash, and write nothing', async () => {
    const r = await run(scriptedModel([call('log_activity', { activity: 'CS50' }), new AIMessage('When did you start?')]))
    expect(r.toolCalls[0].result).toMatchObject({ ok: false, error: 'TOOL_FAILED' })
    expect(r.reply).toBe('When did you start?')
    expect(await listBlocks(user.client, day)).toHaveLength(0)
  })

  test('the model sees the system prompt, then the history, then the new message', async () => {
    const model = scriptedModel([new AIMessage('ok')])
    await run(model, 'I started CS50', [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
    const [first] = model.calls
    expect(first[0]).toBeInstanceOf(SystemMessage)
    expect(String(first[0].content)).toContain('logging helper')
    expect(first.slice(1).map((m) => [m.getType(), String(m.content)])).toEqual([
      ['human', 'hi'],
      ['ai', 'hello'],
      ['human', 'I started CS50'],
    ])
    expect(first.at(-1)).toBeInstanceOf(HumanMessage)
  })

  test('asks the model for one tool call at a time', async () => {
    const model = scriptedModel([new AIMessage('ok')])
    await run(model)
    expect(model.bindOptions).toMatchObject({ parallel_tool_calls: false })
  })

  test('a model failure after a successful write still reports what was saved', async () => {
    // One scripted step, then the model throws (no more steps) as a timeout would.
    const r = await run(scriptedModel([call('log_activity', { activity: 'CS50', start: '16:10' })]))
    expect(r.changed).toBe(true)
    expect(r.reply.toLowerCase()).toContain('saved')
    expect(r.toolCalls).toHaveLength(1)
    expect(await listBlocks(user.client, day)).toHaveLength(1)
  })

  test('a model failure before any write still throws', async () => {
    await expect(run(scriptedModel([]))).rejects.toThrow()
  })

  test('a model that never stops calling tools is cut off with a stuck reply', async () => {
    const r = await run(scriptedModel([call('get_day', {})], { repeatLast: true }))
    expect(r.reply.toLowerCase()).toContain('stuck')
    expect(r.toolCalls.length).toBeLessThanOrEqual(MAX_TOOL_ITERATIONS)
    expect(r.changed).toBe(false)
  })
})
