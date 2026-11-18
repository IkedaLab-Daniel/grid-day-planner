import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
  /** Tool calls recorded on an assistant message; null for user messages and older rows. */
  toolCalls: unknown[] | null
}

interface Row {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  tool_calls: unknown[] | null
}

/** The latest `limit` messages, oldest first. */
export async function loadHistory(sb: SupabaseClient, limit = 20): Promise<ChatMessage[]> {
  const { data, error } = await sb
    .from('chat_messages')
    .select('id, role, content, created_at, tool_calls')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as Row[]).reverse().map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: new Date(r.created_at),
    toolCalls: r.tool_calls,
  }))
}

/** Store a finished turn: the user message (at `startedAt`) and the assistant reply (after it). */
export async function saveTurn(
  sb: SupabaseClient,
  userId: string,
  turn: { user: string; assistant: string; toolCalls: unknown[]; startedAt: Date },
): Promise<void> {
  const repliedAt = new Date(Math.max(Date.now(), turn.startedAt.getTime() + 1))
  const { error } = await sb.from('chat_messages').insert([
    { user_id: userId, role: 'user', content: turn.user, created_at: turn.startedAt.toISOString() },
    {
      user_id: userId,
      role: 'assistant',
      content: turn.assistant,
      tool_calls: turn.toolCalls,
      created_at: repliedAt.toISOString(),
    },
  ])
  if (error) throw error
}

export type TurnStart = { status: 'ok'; id: string } | { status: 'rate_limited' } | { status: 'busy' }

/**
 * Reserve a chat turn: counts the attempt against the hourly limit and refuses while another
 * turn for this user is still running. Atomic in the database.
 */
export async function beginTurn(sb: SupabaseClient, maxPerHour: number): Promise<TurnStart> {
  const { data, error } = await sb.rpc('chat_begin_turn', { max_per_hour: maxPerHour })
  if (error) throw error
  return data as TurnStart
}

/** Mark a reserved turn finished. Best effort: an unfinished turn stops blocking after two minutes. */
export async function endTurn(sb: SupabaseClient, id: string): Promise<void> {
  await sb.rpc('chat_end_turn', { turn_id: id })
}
