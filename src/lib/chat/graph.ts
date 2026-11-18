import { z } from 'zod'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { END, GraphRecursionError, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { buildSystemPrompt, loadDayContext } from '@/lib/chat/context'
import {
  createActivityTool,
  editBlock,
  getDay,
  logActivity,
  removeBlock,
  setEnd,
  type ToolContext,
} from '@/lib/chat/tools'
import { CATEGORIES } from '@/lib/settings/parse'

export const MAX_TOOL_ITERATIONS = 6

export interface ToolCallRecord {
  name: string
  args: unknown
  result: unknown
}

export const STUCK_REPLY = "I got stuck on that one. Could you rephrase what you'd like me to do?"

const WRITE_TOOLS = new Set(['log_activity', 'set_end', 'edit_block', 'delete_block', 'create_activity'])

const hhmm = z.string().describe('24-hour HH:mm in the user timezone, e.g. 16:10')
const date = z.string().describe('Day key YYYY-MM-DD of the grid day; omit for today')

function make<S extends z.ZodObject>(
  name: string,
  description: string,
  schema: S,
  run: (args: z.infer<S>) => Promise<unknown>,
): StructuredToolInterface {
  return tool(
    async (args: z.infer<S>) => {
      try {
        return JSON.stringify(await run(args))
      } catch {
        return JSON.stringify({ ok: false, error: 'TOOL_FAILED', message: 'The tool failed unexpectedly.' })
      }
    },
    { name, description, schema },
  ) as unknown as StructuredToolInterface
}

export function buildTools(ctx: ToolContext): StructuredToolInterface[] {
  return [
    make('get_day', 'Read the actual and plan blocks and activities of a day.', z.object({ date: date.optional() }), (a) =>
      getDay(ctx, a),
    ),
    make(
      'log_activity',
      'Record an actual block. End defaults to now when logging today. May answer GAP: ask the user what they did in the gap, then log it or retry with gap "skip".',
      z.object({
        activity: z.string().describe('Activity name'),
        start: hhmm,
        end: hhmm.optional(),
        date: date.optional(),
        gap: z.literal('skip').optional().describe('Only when the user said to leave the gap empty'),
      }),
      (a) => logActivity(ctx, a),
    ),
    make(
      'set_end',
      'Extend or finish the latest actual block (or block_id). End defaults to now.',
      z.object({ end: hhmm.optional(), block_id: z.string().optional() }),
      (a) => setEnd(ctx, { end: a.end, blockId: a.block_id }),
    ),
    make(
      'edit_block',
      'Change the activity and/or times of an actual block. Only when the user asked for the change.',
      z.object({ block_id: z.string(), start: hhmm.optional(), end: hhmm.optional(), activity: z.string().optional() }),
      (a) => editBlock(ctx, { blockId: a.block_id, start: a.start, end: a.end, activity: a.activity }),
    ),
    make(
      'delete_block',
      'Delete an actual block. Only when the user asked for it.',
      z.object({ block_id: z.string() }),
      (a) => removeBlock(ctx, { blockId: a.block_id }),
    ),
    make(
      'create_activity',
      'Create a new activity. Only after the user agreed in chat.',
      z.object({ name: z.string(), category: z.enum(CATEGORIES as [string, ...string[]]).optional() }),
      (a) => createActivityTool(ctx, { name: a.name, category: a.category as (typeof CATEGORIES)[number] | undefined }),
    ),
  ]
}

function textOf(message: BaseMessage): string {
  const c = message.content
  if (typeof c === 'string') return c
  return c.map((part) => (typeof part === 'object' && part && 'text' in part ? String(part.text) : '')).join('')
}

/** Rebuild what the tools did from the message history, including calls that failed validation. */
export function toolCallsFromMessages(messages: BaseMessage[]): ToolCallRecord[] {
  const results = new Map<string, ToolMessage>()
  for (const m of messages) if (m instanceof ToolMessage) results.set(m.tool_call_id, m)

  const records: ToolCallRecord[] = []
  for (const m of messages) {
    if (!(m instanceof AIMessage)) continue
    for (const call of m.tool_calls ?? []) {
      const reply = call.id ? results.get(call.id) : undefined
      if (!reply) continue
      let result: unknown
      try {
        result = reply.status === 'error' ? undefined : JSON.parse(textOf(reply))
      } catch {
        result = undefined
      }
      records.push({
        name: call.name,
        args: call.args,
        result: result ?? { ok: false, error: 'TOOL_FAILED', message: textOf(reply).slice(0, 300) },
      })
    }
  }
  return records
}

const didChange = (calls: ToolCallRecord[]) =>
  calls.some((c) => {
    const r = c.result as { ok?: boolean; unchanged?: boolean }
    return WRITE_TOOLS.has(c.name) && r?.ok === true && !r.unchanged
  })

export async function runChatTurn(input: {
  model: BaseChatModel
  ctx: ToolContext
  history: { role: 'user' | 'assistant'; content: string }[]
  message: string
}): Promise<{ reply: string; changed: boolean; toolCalls: ToolCallRecord[] }> {
  const tools = buildTools(input.ctx)
  if (!input.model.bindTools) throw new Error('This model does not support tool calling')
  const withTools = input.model.bindTools(tools)
  const system = new SystemMessage(buildSystemPrompt(await loadDayContext(input.ctx)))

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('agent', async (state) => ({ messages: [await withTools.invoke([system, ...state.messages])] }))
    .addNode('tools', new ToolNode(tools))
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', (state) => {
      const last = state.messages.at(-1)
      return last instanceof AIMessage && (last.tool_calls?.length ?? 0) > 0 ? 'tools' : END
    })
    .addEdge('tools', 'agent')
    .compile()

  const initial: BaseMessage[] = [
    ...input.history.map((m) => (m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content))),
    new HumanMessage(input.message),
  ]

  let messages = initial
  let stuck = false
  try {
    const stream = await graph.stream(
      { messages: initial },
      { streamMode: 'values', recursionLimit: 2 * MAX_TOOL_ITERATIONS + 1 },
    )
    for await (const state of stream) messages = state.messages
  } catch (e) {
    if (!(e instanceof GraphRecursionError)) throw e
    stuck = true
  }

  const toolCalls = toolCallsFromMessages(messages)
  const last = messages.at(-1)
  const reply = stuck
    ? STUCK_REPLY
    : last instanceof AIMessage && textOf(last).trim()
      ? textOf(last).trim()
      : 'Done.'
  return { reply, changed: didChange(toolCalls), toolCalls }
}
