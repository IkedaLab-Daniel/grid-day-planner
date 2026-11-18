import type { SupabaseClient } from '@supabase/supabase-js'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { getProfile } from '@/lib/db/profile'
import { runChatTurn, type ToolCallRecord } from '@/lib/chat/graph'
import { countUserMessagesSince, loadHistory, saveTurn, type ChatMessage } from '@/lib/chat/store'

export const MAX_MESSAGE_LENGTH = 1000
export const RATE_LIMIT_PER_HOUR = 30
export const HISTORY_LIMIT = 20

export class ChatError extends Error {
  constructor(
    readonly status: 400 | 429 | 503,
    message: string,
  ) {
    super(message)
    this.name = 'ChatError'
  }
}

export interface ChatServiceDeps {
  sb: SupabaseClient
  userId: string
  model: BaseChatModel
  /** The "now" the tools use. Rate limiting and message timestamps always use the wall clock. */
  now?: Date
}

/** The skipWith arguments of a log_activity call that was refused with GAP, if that ended the turn. */
function pendingGap(calls: unknown[] | null): unknown | null {
  const last = calls?.at(-1) as ToolCallRecord | undefined
  const result = last?.result as { error?: string; skipWith?: unknown } | undefined
  return last?.name === 'log_activity' && result?.error === 'GAP' && result.skipWith ? result.skipWith : null
}

/**
 * Replay stored text only, but let the model see a gap question it is waiting on: the stored
 * text alone does not say which block to log again if the user answers "skip".
 */
function replayHistory(history: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const last = history.at(-1)
  return history.map((m) => {
    const pending = m === last && m.role === 'assistant' ? pendingGap(m.toolCalls) : null
    const note = pending
      ? `\n[Pending: that log_activity was refused with GAP. If the user says to skip the gap, call log_activity with exactly ${JSON.stringify(pending)}.]`
      : ''
    return { role: m.role, content: m.content + note }
  })
}

export async function sendMessage(
  deps: ChatServiceDeps,
  message: string,
): Promise<{ reply: string; changed: boolean }> {
  const text = message.trim()
  if (!text) throw new ChatError(400, 'Type a message first.')
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new ChatError(400, `Please keep messages under ${MAX_MESSAGE_LENGTH} characters.`)
  }

  const startedAt = new Date()
  const recent = await countUserMessagesSince(deps.sb, new Date(startedAt.getTime() - 3600_000))
  if (recent >= RATE_LIMIT_PER_HOUR) {
    throw new ChatError(429, "You've sent a lot of messages this hour. Please try again a little later.")
  }

  const [history, profile] = await Promise.all([loadHistory(deps.sb, HISTORY_LIMIT), getProfile(deps.sb)])

  let turn
  try {
    turn = await runChatTurn({
      model: deps.model,
      ctx: { sb: deps.sb, userId: deps.userId, profile, now: deps.now ?? startedAt },
      history: replayHistory(history),
      message: text,
    })
  } catch (e) {
    console.error('chat turn failed:', e instanceof Error ? e.name : typeof e)
    throw new ChatError(503, 'The helper is unavailable right now. Please try again in a moment.')
  }

  await saveTurn(deps.sb, deps.userId, {
    user: text,
    assistant: turn.reply,
    toolCalls: turn.toolCalls,
    startedAt,
  })
  return { reply: turn.reply, changed: turn.changed }
}

export async function getHistory(sb: SupabaseClient): Promise<ChatMessage[]> {
  return loadHistory(sb, HISTORY_LIMIT)
}
